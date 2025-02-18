import { ChangeDetectorRef, Component, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InventoryService } from '../inventory/inventory.service';
import { ToastrService } from 'ngx-toastr';
import { MatTableDataSource } from '@angular/material/table';
import { MatInput } from '@angular/material/input';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface StockTakingItem {
  productId: string;
  barcode: string;
  name: string;
  currentStock: number;  // From inventory
  actualStock: number;   // User input
  difference: number;
  warehouseId: string; // Add this
}

@Component({
  selector: 'app-stock-taking',
  templateUrl: './stocktaking.component.html',
  styleUrls: ['./stocktaking.component.scss'],
  encapsulation: ViewEncapsulation.Emulated 
})
export class StockTakingComponent implements OnInit {
  @ViewChild('searchInput', { read: MatInput }) searchInput!: MatInput;
  stockTakingForm: FormGroup;
  warehouses: { id: string, name: string }[] = []; 
  selectedWarehouseId: string | null = null; 
  stockTakingList: any[] = [];
  dataSource = new MatTableDataSource(this.stockTakingList);
  
  constructor(
    private fb: FormBuilder,
    private stockTakingService: InventoryService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.stockTakingForm = this.fb.group({
      searchInput: [''],
      warehouse: ['', Validators.required],  // 'warehouse' must be registered here
    });
  }

  ngOnInit(): void {
    this.stockTakingForm.get('searchInput')?.valueChanges
    .pipe(
      debounceTime(500), // Wait for 500ms after the user stops typing
      distinctUntilChanged() // Only emit if the value has changed
    )
    .subscribe(() => {
      this.searchProduct();
      // this.searchInput.blur(); // Blur the field after the user stops typing
    });
    this.loadWarehouses(); // Load warehouses on init
  }

  loadWarehouses() {
    this.stockTakingService.getWarehouses().subscribe({
      next: (warehouses) => {
        this.warehouses = warehouses;
        console.log('Warehouses loaded:', this.warehouses);
      },
      error: (err) => {
        this.toastr.error('Failed to load warehouses');
        console.error('Error loading warehouses:', err);
      }
    });
  }

  ngAfterViewInit(): void {
    // Focus on the search input field when the page loads
    this.focusSearchInput();
  }

  focusSearchInput(): void {
    this.searchInput.focus(); // Focus on the search input field
  }

  searchProduct() {
    const searchValue = this.stockTakingForm.get('searchInput')?.value;
    const warehouseId = this.stockTakingForm.get('warehouse')?.value;
  
    if (!searchValue || !warehouseId) {
      this.toastr.warning('Please select a warehouse and enter a search term');
      return;
    }
  
    this.stockTakingService.searchProductByBarcodeOrName(searchValue, warehouseId).subscribe({
      next: (products) => {
        if (products.length === 0) {
          this.toastr.warning('No products found');
          return;
        }
  
        // Process products and update the stockTakingList
        products.forEach(product => {
          const existingItem = this.stockTakingList.find(p => p.productId === product.id);
  
          if (existingItem) {
            existingItem.actualStock += 1;
            existingItem.difference = existingItem.actualStock - existingItem.currentStock;
          } else {
            this.stockTakingList.push({
              productId: product.id,
              barcode: product.barcode,
              name: product.name,
              currentStock: product.stock ?? 0,
              actualStock: 1,
              difference: 1 - (product.stock ?? 0),
              warehouseId: warehouseId
            });
          }
        });
  
        // Update MatTableDataSource or force change detection
        this.dataSource.data = [...this.stockTakingList];
        this.calculateDifference();
        this.stockTakingForm.get('searchInput').reset();
        this.focusSearchInput();
      },
      error: (err) => {
        console.error('Search failed', err);
        this.toastr.error('Search failed');
      }
    });
  }
  

  calculateDifference() {
    this.stockTakingList.forEach(item => {
      const actualStock = item.actualStock ?? 0;
      const currentStock = item.currentStock ?? 0;
  
      item.difference = actualStock - currentStock;
    });
  }

  submitStockTaking() {
    // Filter items with actual changes
    const changedItems = this.stockTakingList.filter(item => 
      item.actualStock !== item.currentStock
    );
  
    if (changedItems.length === 0) {
      this.toastr.warning('No changes to submit');
      return;
    }
  
    this.stockTakingService.updateStockItems(changedItems).subscribe({
      next: () => {
        this.toastr.success('Stock updated successfully');
        this.stockTakingList = [];
      },
      error: (err) => {
        this.toastr.error('Error updating stock');
        console.error('Update error:', err);
      }
    });
  }

  rollbackStockTaking() {
    this.stockTakingService.rollbackStockTaking().subscribe({
      next: () => {
        this.toastr.success('Stock rollback successful');
      },
      error: (err) => {
        this.toastr.error(err.error?.Message || 'Error during rollback');
      }
    });
  }
}