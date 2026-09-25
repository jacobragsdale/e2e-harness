import { HttpClient, httpResource } from '@angular/common/http';
import type { HttpResourceRef } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Signal } from '@angular/core';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';
import { z } from 'zod';

const statusSchema = z.enum(['ACTIVE', 'DISCONTINUED']);

export const categorySchema = z.strictObject({ id: z.string(), name: z.string() }).readonly();
export const productSchema = z
  .strictObject({
    id: z.string(),
    sku: z.string(),
    name: z.string(),
    categoryId: z.string(),
    categoryName: z.string(),
    listPrice: z.number(),
    finalPrice: z.number(),
    status: statusSchema,
    updatedAt: z.string()
  })
  .readonly();
export const ruleSchema = z.strictObject({ id: z.string(), productId: z.string(), name: z.string(), percent: z.number(), enabled: z.boolean(), createdAt: z.string() }).readonly();
export const productDetailSchema = z.strictObject({ ...productSchema.unwrap().shape, rules: z.array(ruleSchema).readonly() }).readonly();
export const jobSchema = z
  .strictObject({
    id: z.number(),
    productId: z.string(),
    status: z.enum(['QUEUED', 'RUNNING', 'DONE', 'FAILED']),
    oldPrice: z.number().nullable(),
    newPrice: z.number().nullable(),
    error: z.string().nullable(),
    requestedAt: z.string(),
    finishedAt: z.string().nullable()
  })
  .readonly();
/** The body of a 400 or 409: a message and, for validation errors, one message per field. */
export const apiErrorSchema = z.object({ error: z.string(), fields: z.record(z.string(), z.string()).optional() });

export type ProductStatus = z.infer<typeof statusSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Product = z.infer<typeof productSchema>;
export type Rule = z.infer<typeof ruleSchema>;
export type ProductDetail = z.infer<typeof productDetailSchema>;
export type Job = z.infer<typeof jobSchema>;
export interface ProductInput {
  readonly sku: string;
  readonly name: string;
  readonly categoryId: string;
  readonly listPrice: number;
  readonly status: ProductStatus;
}
export interface RuleInput {
  readonly name: string;
  readonly percent: number;
  readonly enabled: boolean;
}
export interface ProductFilter {
  readonly q: string;
  readonly category: string;
  readonly status: string;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  public categories(): HttpResourceRef<readonly Category[] | undefined> {
    return httpResource(() => '/api/categories', { parse: (v) => z.array(categorySchema).readonly().parse(v) });
  }

  public products(filter: Signal<ProductFilter>): HttpResourceRef<readonly Product[] | undefined> {
    return httpResource(() => ({ url: '/api/products', params: { ...filter() } }), { parse: (v) => z.array(productSchema).readonly().parse(v) });
  }

  public product(id: Signal<string | undefined>): HttpResourceRef<ProductDetail | undefined> {
    return httpResource(
      () => {
        const value = id();
        return value === undefined ? undefined : `/api/products/${value}`;
      },
      { parse: (v) => productDetailSchema.parse(v) }
    );
  }

  public jobs(): HttpResourceRef<readonly Job[] | undefined> {
    return httpResource(() => '/api/jobs', { parse: (v) => z.array(jobSchema).readonly().parse(v) });
  }

  public job(id: number): Observable<Job> {
    return this.http.get<unknown>(`/api/jobs/${String(id)}`).pipe(map((v) => jobSchema.parse(v)));
  }

  public createProduct(input: ProductInput): Observable<Product> {
    return this.http.post<unknown>('/api/products', input).pipe(map((v) => productSchema.parse(v)));
  }

  public updateProduct(id: string, input: Omit<ProductInput, 'sku'>): Observable<Product> {
    return this.http.put<unknown>(`/api/products/${id}`, input).pipe(map((v) => productSchema.parse(v)));
  }

  public addRule(productId: string, input: RuleInput): Observable<Rule> {
    return this.http.post<unknown>(`/api/products/${productId}/rules`, input).pipe(map((v) => ruleSchema.parse(v)));
  }

  public updateRule(id: string, input: Partial<RuleInput>): Observable<Rule> {
    return this.http.put<unknown>(`/api/rules/${id}`, input).pipe(map((v) => ruleSchema.parse(v)));
  }

  public deleteRule(id: string): Observable<unknown> {
    return this.http.delete(`/api/rules/${id}`);
  }

  public reprice(productId: string): Observable<Job> {
    return this.http.post<unknown>(`/api/products/${productId}/reprice`, null).pipe(map((v) => jobSchema.parse(v)));
  }
}

/** The message to show for a failed request, and any per-field messages the API sent. */
export function describeError(error: unknown): { readonly message: string; readonly fields: Readonly<Record<string, string>> } {
  const body = typeof error === 'object' && error !== null && 'error' in error ? apiErrorSchema.safeParse(error.error) : undefined;
  if (body?.success === true) {
    return { message: body.data.error, fields: body.data.fields ?? {} };
  }
  return { message: 'Something went wrong. Try again.', fields: {} };
}
