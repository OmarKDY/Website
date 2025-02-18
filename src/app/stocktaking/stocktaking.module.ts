import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StockTakingComponent } from './stocktaking.component';
import { RouterModule } from '@angular/router';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { StockTakingDialogComponent } from '../stocktaking-dialog/stocktaking-dialog.component';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

@NgModule({
  declarations: [
    StockTakingComponent,
    StockTakingDialogComponent,
  ],
    imports: [
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
      { path: '', component: StockTakingComponent }
    ]),
  ],
  exports: [StockTakingDialogComponent],
  entryComponents: [StockTakingDialogComponent] 
})
export class StockTakingModule {}
