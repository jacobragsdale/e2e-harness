import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'products' },
  { path: 'products', title: 'Products', loadComponent: async () => (await import('./products/product-list')).ProductList },
  { path: 'products/new', title: 'New product', loadComponent: async () => (await import('./products/product-form')).ProductForm },
  { path: 'products/:id', title: 'Product', loadComponent: async () => (await import('./products/product-detail')).ProductDetailPage },
  { path: 'products/:id/edit', title: 'Edit product', loadComponent: async () => (await import('./products/product-form')).ProductForm },
  { path: 'jobs', title: 'Reprice jobs', loadComponent: async () => (await import('./jobs/job-list')).JobList },
  { path: '**', title: 'Not found', loadComponent: async () => (await import('./shared/not-found')).NotFound }
];
