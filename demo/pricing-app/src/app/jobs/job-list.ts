import { CurrencyPipe, DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { Api } from '../api';

@Component({
  selector: 'app-job-list',
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatTableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="header">
      <h1>Reprice jobs</h1>
      <button mat-stroked-button type="button" (click)="jobs.reload()">Refresh</button>
    </div>
    <table mat-table [dataSource]="jobs.value() ?? []">
      <ng-container matColumnDef="id">
        <th mat-header-cell *matHeaderCellDef>Job</th>
        <td mat-cell *matCellDef="let j">#{{ j.id }}</td>
      </ng-container>
      <ng-container matColumnDef="product">
        <th mat-header-cell *matHeaderCellDef>Product</th>
        <td mat-cell *matCellDef="let j">
          <a [routerLink]="['/products', j.productId]">{{ j.productId }}</a>
        </td>
      </ng-container>
      <ng-container matColumnDef="status">
        <th mat-header-cell *matHeaderCellDef>Status</th>
        <td mat-cell *matCellDef="let j" [title]="j.error ?? ''">{{ j.status }}</td>
      </ng-container>
      <ng-container matColumnDef="oldPrice">
        <th mat-header-cell *matHeaderCellDef>Old price</th>
        <td mat-cell *matCellDef="let j">{{ j.oldPrice | currency: 'USD' }}</td>
      </ng-container>
      <ng-container matColumnDef="newPrice">
        <th mat-header-cell *matHeaderCellDef>New price</th>
        <td mat-cell *matCellDef="let j">{{ j.newPrice | currency: 'USD' }}</td>
      </ng-container>
      <ng-container matColumnDef="requestedAt">
        <th mat-header-cell *matHeaderCellDef>Requested</th>
        <td mat-cell *matCellDef="let j">{{ j.requestedAt | date: 'medium' }}</td>
      </ng-container>
      <tr mat-header-row *matHeaderRowDef="columns"></tr>
      <tr mat-row *matRowDef="let row; columns: columns"></tr>
      <tr class="mat-mdc-row" *matNoDataRow>
        <td class="mat-mdc-cell" [attr.colspan]="columns.length">No reprice jobs yet.</td>
      </tr>
    </table>
  `,
  styles: `
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    table {
      width: 100%;
    }
  `
})
export class JobList {
  protected readonly jobs = inject(Api).jobs();
  protected readonly columns = ['id', 'product', 'status', 'oldPrice', 'newPrice', 'requestedAt'] as const;
}
