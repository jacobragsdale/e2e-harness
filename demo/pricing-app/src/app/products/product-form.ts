import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import type { Observable } from 'rxjs';
import { Api, describeError } from '../api';
import type { Product, ProductStatus } from '../api';

/** Creates a product at /products/new and edits one at /products/:id/edit. */
@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form.html',
  styles: `
    form {
      display: flex;
      flex-direction: column;
      max-width: 420px;
    }
    .actions {
      display: flex;
      gap: 8px;
    }
  `
})
export class ProductForm {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** The route's :id; absent on /products/new. */
  public readonly id = input<string>();
  protected readonly editing = computed(() => this.id() !== undefined);
  protected readonly categories = this.api.categories();
  protected readonly existing = this.api.product(this.id);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  private readonly fb = inject(FormBuilder).nonNullable;
  protected readonly form = this.fb.group({
    sku: ['', [Validators.required, Validators.pattern(/^[A-Z]{3}-\d{3}$/)]],
    name: ['', [Validators.required, Validators.maxLength(80)]],
    categoryId: ['', Validators.required],
    listPrice: [0, [Validators.required, Validators.min(0.01)]],
    status: this.fb.control<ProductStatus>('ACTIVE')
  });

  constructor() {
    effect(() => {
      const product = this.existing.value();
      if (product !== undefined) {
        this.form.patchValue(product);
        this.form.controls.sku.disable();
      }
    });
  }

  /** The message for a field's first error, in the order the user should fix them. */
  protected error(field: keyof typeof this.form.controls): string {
    const control = this.form.controls[field];
    const server: unknown = control.getError('server');
    if (control.hasError('required')) {
      return messages[field];
    }
    if (typeof server === 'string') {
      return server;
    }
    if (control.hasError('maxlength')) {
      return 'Name must be 80 characters or fewer';
    }
    return control.invalid ? messages[field] : '';
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const id = this.id();
    // The SKU is fixed once created, so an update sends every field but it.
    const changes = { name: value.name, categoryId: value.categoryId, listPrice: value.listPrice, status: value.status };
    const request: Observable<Product> = id === undefined ? this.api.createProduct(value) : this.api.updateProduct(id, changes);
    this.saving.set(true);
    this.formError.set('');
    request.subscribe({
      next: (product) => {
        this.snackBar.open(id === undefined ? `Product ${product.sku} created` : 'Product saved', 'Dismiss', { duration: 4000 });
        this.router.navigate(['/products', product.id]).catch((navError: unknown) => {
          console.error(navError);
        });
      },
      error: (error: unknown) => {
        this.saving.set(false);
        const { message, fields } = describeError(error);
        const unshown = Object.entries(fields).filter(([field, text]) => {
          const control = this.form.get(field);
          control?.setErrors({ server: text });
          return control === null;
        });
        // A message with no form field to show it on (or no field at all) goes above the buttons.
        this.formError.set(unshown.length > 0 || Object.keys(fields).length === 0 ? message : '');
      }
    });
  }
}

const messages = {
  sku: 'SKU must look like ABC-123',
  name: 'Name is required',
  categoryId: 'Category is required',
  listPrice: 'List price must be greater than 0',
  status: 'Status is required'
} as const;
