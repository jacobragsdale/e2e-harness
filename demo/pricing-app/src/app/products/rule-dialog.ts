import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { Rule, RuleInput } from '../api';

/** Adds a discount rule, or edits one when opened with a rule. Closes with the RuleInput, or nothing on cancel. */
@Component({
  selector: 'app-rule-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>{{ rule === null ? 'Add discount rule' : 'Edit discount rule' }}</h2>
    <form [formGroup]="form" (ngSubmit)="save()">
      <mat-dialog-content>
        <mat-form-field>
          <mat-label>Rule name</mat-label>
          <input matInput formControlName="name" />
          @if (form.controls.name.invalid) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Discount %</mat-label>
          <input matInput type="number" formControlName="percent" />
          @if (form.controls.percent.invalid) {
            <mat-error>Percent must be between 0 and 90</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancel</button>
        <button mat-flat-button type="submit">Save rule</button>
      </mat-dialog-actions>
    </form>
  `,
  styles: `
    mat-form-field {
      display: block;
    }
  `
})
export class RuleDialog {
  private readonly ref = inject<MatDialogRef<RuleDialog, RuleInput>>(MatDialogRef);
  protected readonly rule = inject<Rule | null>(MAT_DIALOG_DATA);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: [this.rule?.name ?? '', [Validators.required, Validators.maxLength(60)]],
    percent: [this.rule?.percent ?? 10, [Validators.required, Validators.min(0.01), Validators.max(90)]]
  });

  protected save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.ref.close({ ...this.form.getRawValue(), enabled: this.rule?.enabled ?? true });
  }
}
