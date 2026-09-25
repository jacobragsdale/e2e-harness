import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Api } from '../api';

@Component({
  selector: 'app-product-list',
  imports: [CurrencyPipe, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatProgressBarModule, MatSelectModule, MatTableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-list.html',
  styles: `
    .header,
    .filters {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .header {
      justify-content: space-between;
    }
    table {
      width: 100%;
    }
    .discontinued {
      color: var(--mat-sys-error);
    }
  `
})
export class ProductList {
  private readonly api = inject(Api);
  protected readonly q = signal('');
  protected readonly category = signal('');
  protected readonly status = signal('');
  protected readonly categories = this.api.categories();
  protected readonly products = this.api.products(computed(() => ({ q: this.q(), category: this.category(), status: this.status() })));
  protected readonly columns = ['sku', 'name', 'category', 'listPrice', 'finalPrice', 'status'] as const;
  protected readonly count = computed(() => this.products.value()?.length ?? 0);
}
