import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { StockTransferComponent } from './stock-transfer.component';



@NgModule({
  declarations: [StockTransferComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule, 
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    FormsModule,
    MatSelectModule,
    RouterModule.forChild([
        { path: '', component: StockTransferComponent }
      ]),
    ],
    exports: [
      ReactiveFormsModule,
      FormsModule,
      MatFormFieldModule,
      MatInputModule,
      MatSelectModule,
      MatTableModule,
      MatButtonModule,
      MatIconModule,
    ],
  })
export class StockTransferModule { }
