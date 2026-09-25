import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mat-toolbar color="primary">
      <span class="brand">Pricing Admin</span>
      <nav>
        <a mat-button routerLink="/products" routerLinkActive="active">Products</a>
        <a mat-button routerLink="/jobs" routerLinkActive="active">Reprice jobs</a>
      </nav>
    </mat-toolbar>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .brand {
      margin-right: 24px;
    }
    .active {
      text-decoration: underline;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      padding: 16px 24px;
    }
  `
})
export class App {}
