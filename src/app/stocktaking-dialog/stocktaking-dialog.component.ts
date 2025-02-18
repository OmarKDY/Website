import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-stocktaking-dialog',
  templateUrl: './stocktaking-dialog.component.html',
  styleUrls: ['./stocktaking-dialog.component.scss']
})
export class StockTakingDialogComponent {
  newQuantity: number;

  constructor(
    public dialogRef: MatDialogRef<StockTakingDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {}

  updateStock() {
    if (this.newQuantity < 0) {
      alert('Quantity cannot be negative.');
      return;
    }

    // Implement update stock logic here
    console.log('Updated quantity:', this.newQuantity);
    this.dialogRef.close(this.newQuantity);
  }
}