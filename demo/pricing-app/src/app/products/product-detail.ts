import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { filter, switchMap, takeWhile, timer } from 'rxjs';
import type { Observable } from 'rxjs';
import { Api, describeError } from '../api';
import type { Job, Rule, RuleInput } from '../api';
import { ConfirmDialog } from '../shared/confirm-dialog';
import type { ConfirmData } from '../shared/confirm-dialog';
import { RuleDialog } from './rule-dialog';

@Component({
  selector: 'app-product-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule, MatSlideToggleModule, MatTableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail.html',
  styles: `
    .header {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .header h1 {
      flex: 1;
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 4px 16px;
    }
    dt {
      font-weight: 500;
    }
    dd {
      margin: 0;
    }
    table {
      width: 100%;
    }
  `
})
export class ProductDetailPage {
  private readonly api = inject(Api);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  public readonly id = input.required<string>();
  protected readonly product = this.api.product(this.id);
  protected readonly job = signal<Job | undefined>(undefined);
  protected readonly ruleColumns = ['name', 'percent', 'enabled', 'actions'] as const;

  protected reprice(): void {
    this.api
      .reprice(this.id())
      .pipe(
        switchMap((job) => this.poll(job.id)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: (job) => {
          this.job.set(job);
          if (job.status === 'DONE') {
            this.snackBar.open(`Repriced: ${money(job.oldPrice)} → ${money(job.newPrice)}`, 'Dismiss', { duration: 5000 });
            this.product.reload();
          } else if (job.status === 'FAILED') {
            this.snackBar.open(`Reprice failed: ${job.error ?? 'unknown error'}`, 'Dismiss', { duration: 5000 });
          }
        },
        error: (error: unknown) => {
          this.snackBar.open(describeError(error).message, 'Dismiss', { duration: 5000 });
        }
      });
  }

  protected addRule(): void {
    this.editRuleDialog(null)
      .pipe(switchMap((input) => this.api.addRule(this.id(), input)))
      .subscribe(this.afterChange('Rule added'));
  }

  protected editRule(rule: Rule): void {
    this.editRuleDialog(rule)
      .pipe(switchMap((input) => this.api.updateRule(rule.id, input)))
      .subscribe(this.afterChange('Rule saved'));
  }

  protected toggleRule(rule: Rule, enabled: boolean): void {
    this.api.updateRule(rule.id, { enabled }).subscribe(this.afterChange(enabled ? 'Rule enabled' : 'Rule disabled'));
  }

  protected deleteRule(rule: Rule): void {
    this.dialog
      .open<ConfirmDialog, ConfirmData, boolean>(ConfirmDialog, { data: { title: 'Delete rule', message: `Delete the rule “${rule.name}”? This cannot be undone.`, confirm: 'Delete' } })
      .afterClosed()
      .pipe(
        filter((confirmed) => confirmed === true),
        switchMap(() => this.api.deleteRule(rule.id))
      )
      .subscribe(this.afterChange('Rule deleted'));
  }

  private editRuleDialog(rule: Rule | null): Observable<RuleInput> {
    return this.dialog
      .open<RuleDialog, Rule | null, RuleInput>(RuleDialog, { data: rule, width: '400px' })
      .afterClosed()
      .pipe(filter((input) => input !== undefined));
  }

  private afterChange(message: string): { next: () => void; error: (error: unknown) => void } {
    return {
      next: () => {
        this.snackBar.open(`${message}. Reprice to apply it.`, 'Dismiss', { duration: 4000 });
        this.product.reload();
      },
      error: (error: unknown) => {
        this.snackBar.open(describeError(error).message, 'Dismiss', { duration: 5000 });
        this.product.reload();
      }
    };
  }

  private poll(jobId: number): Observable<Job> {
    return timer(0, 500).pipe(
      switchMap(() => this.api.job(jobId)),
      takeWhile((job) => job.status === 'QUEUED' || job.status === 'RUNNING', true)
    );
  }
}

function money(value: number | null): string {
  return value === null ? '—' : `$${value.toFixed(2)}`;
}
