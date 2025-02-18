import { ChangeDetectorRef, Component, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { InventoryService } from '../inventory/inventory.service';
import { ToastrService } from 'ngx-toastr';
import { MatTableDataSource } from '@angular/material/table';
import { MatInput } from '@angular/material/input';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

interface StockTransferItem {
  sourceProductId: string;
  destinationProductId: string;
  barcode: string;
  name: string;
  currentStock: number;
  quantity: number;
  warehouseId: string;
}

@Component({
  selector: 'app-stock-transfer',
  templateUrl: './stock-transfer.component.html',
  styleUrls: ['./stock-transfer.component.scss'],
  encapsulation: ViewEncapsulation.Emulated
})
export class StockTransferComponent implements OnInit {
  @ViewChild('searchInput', { read: MatInput }) searchInput!: MatInput;

  sourceForm: FormGroup;
  destinationForm: FormGroup;
  warehouses: { id: string, name: string }[] = [];
  sourceStockList: StockTransferItem[] = [];
  destinationProductId: string = '00000000-0000-0000-0000-000000000000';
  sourceDataSource = new MatTableDataSource<StockTransferItem>([]);

  constructor(
    private fb: FormBuilder,
    private inventoryService: InventoryService,
    private toastr: ToastrService,
    private cdr: ChangeDetectorRef
  ) {
    this.sourceForm = this.fb.group({
      searchInput: [''],
      warehouse: ['', Validators.required]
    });

    this.destinationForm = this.fb.group({
      searchInput: [''],
      warehouse: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.loadWarehouses();
    this.setupSearchSubscription();
  }

  loadWarehouses() {
    this.inventoryService.getWarehouses().subscribe({
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

  private setupSearchSubscription(): void {
    this.sourceForm.get('searchInput')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.searchProduct('source');
      });
  }
  focusSearchInput(): void {
    this.searchInput.focus(); // Focus on the search input field
  }
  searchSourceProduct(): void {
    console.log('Searching source product...');
    this.searchProduct('source');
  }

  searchDestinationProduct(): void {
    console.log('Searching destination product...');
    this.searchProduct('destination');
  }

  searchProduct(type: 'source' | 'destination'): void {
    console.log(`Searching ${type} product...`);
    
    const form = type === 'source' ? this.sourceForm : this.destinationForm;
    const warehouseId = form.get('warehouse')?.value;
    const searchInput = form.get('searchInput')?.value;
  
    console.log('Search params:', { 
      warehouseId, 
      searchInput, 
      type,
      formValue: form.value // Log entire form value
    });
  
    if (!warehouseId) {
      this.toastr.warning(`Please select a ${type} warehouse first`);
      return;
    }
  
    if (!searchInput) {
      this.toastr.warning('Please enter a product name or scan barcode');
      return;
    }
  
    this.inventoryService.searchProductByBarcodeOrName(searchInput, warehouseId)
      .subscribe({
        next: (products) => {
          console.log(`${type} products found:`, products);
          
          if (!products) {
            console.error(`${type} products response is null or undefined`);
            this.toastr.error(`Invalid response for ${type} product search`);
            return;
          }
          
          if (products.length === 0) {
            console.log(`No ${type} products found for search:`, searchInput);
            this.toastr.warning(`No product found in ${type} warehouse with barcode/name: ${searchInput}`);
            return;
          }
  
          const product = products[0];
          console.log(`Selected ${type} product:`, product);
          
          if (type === 'source') {
            this.handleSourceProduct(product, warehouseId);
          } else {
            // Add additional validation for destination product
            if (!product.id) {
              console.error('Destination product has no ID:', product);
              this.toastr.error('Invalid destination product data');
              return;
            }
            this.handleDestinationProduct(product);
          }
          
          // Reset the search input
          form.patchValue({ searchInput: '' });
          this.calculateDifference();
          this.sourceForm.get('searchInput').reset();
          this.destinationForm.get('searchInput').reset();

          this.focusSearchInput();
          this.cdr.detectChanges();
        },
        error: (error) => {
          console.error(`Error searching ${type} product:`, error);
          this.toastr.error(`Failed to search ${type} product: ${error.message}`);
        }
      });
  }
  private handleSourceProduct(product: any, warehouseId: string): void {
    console.log('Handling source product:', product);
    
    const newItem: StockTransferItem = {
      sourceProductId: product.id,
      destinationProductId: this.destinationProductId, // Use the current destinationProductId
      barcode: product.barcode,
      name: product.name,
      currentStock: product.stock,
      quantity: 0,
      warehouseId: warehouseId
    };

    this.sourceStockList.push(newItem);
    this.updateDataSource();
  }
  private handleDestinationProduct(product: any): void {
    console.log('Before updating destinationProductId:', this.destinationProductId);
    console.log('New destination product:', product);
    
    this.destinationProductId = product.id;
    console.log('After updating destinationProductId:', this.destinationProductId);
  
    // Update all items in the source list
    this.sourceStockList = this.sourceStockList.map(item => {
      const updatedItem = {
        ...item,
        destinationProductId: this.destinationProductId
      };
      console.log('Updated source item:', updatedItem);
      return updatedItem;
    });
  
    // this.updateDataSource();
    this.toastr.success('Destination product selected');
  }
  
  // private updateDataSource(): void {
  //   console.log('Updating data source. Current sourceStockList:', this.sourceStockList);
  //   this.sourceDataSource.data = [...this.sourceStockList];
  //   console.log('New data source data:', this.sourceDataSource.data);
  //   this.cdr.detectChanges();
  // }

  submitStockTransfer(): void {
    if (!this.validateTransfer()) {
      return;
    }

    const sourceWarehouseId = this.sourceForm.get('warehouse')?.value;
    const destinationWarehouseId = this.destinationForm.get('warehouse')?.value;

    const transferItems = this.sourceStockList
      .filter(item => item.quantity > 0)
      .map(item => ({
        sourceProductId: item.sourceProductId,
        destinationProductId: this.destinationProductId, // Use the class property
        quantity: item.quantity,
        sourceWarehouseId: sourceWarehouseId,
        destinationWarehouseId: destinationWarehouseId
      }));

    console.log('Submitting transfer items:', transferItems);

    this.inventoryService.transferStock(transferItems).subscribe({
      next: () => {
        this.toastr.success('Stock transferred successfully');
        this.resetForm();
      },
      error: (error) => {
        console.error('Transfer error:', error);
        this.toastr.error('Failed to transfer stock');
      }
    });
  }

  // Add these functions to your StockTransferComponent class

calculateDifference(): void {
  // Ensure quantities are valid numbers
  this.sourceStockList = this.sourceStockList.map(item => {
    // Convert quantity to number and ensure it's not negative
    let quantity = Number(item.quantity);
    item.quantity = isNaN(quantity) ? 0 : Math.max(0, quantity);
    
    // Ensure quantity doesn't exceed current stock
    if (item.quantity > item.currentStock) {
      item.quantity = item.currentStock;
      this.toastr.warning(`Quantity cannot exceed current stock of ${item.currentStock}`);
    }
    
    return item;
  });
  
  // Update the data source to reflect changes
  this.updateDataSource();
}

private validateTransfer(): boolean {
  if (!this.sourceForm.get('warehouse')?.value || !this.destinationForm.get('warehouse')?.value) {
    this.toastr.warning('Please select both source and destination warehouses');
    return false;
  }

  if (this.destinationProductId === '00000000-0000-0000-0000-000000000000') {
    this.toastr.warning('Please select a destination product');
    return false;
  }

  // Check if there are any items with quantity greater than 0
  const hasValidQuantity = this.sourceStockList.some(item => {
    const quantity = Number(item.quantity);
    return !isNaN(quantity) && quantity > 0;
  });

  if (!hasValidQuantity) {
    this.toastr.warning('Please enter quantity to transfer');
    return false;
  }

  return true;
}

// Update the updateDataSource method to handle quantity changes
private updateDataSource(): void {
  console.log('Updating data source with quantities:', this.sourceStockList);
  this.sourceDataSource.data = [...this.sourceStockList];
  this.cdr.detectChanges();
}

  private resetForm(): void {
    this.sourceStockList = [];
    this.sourceDataSource.data = [];
    this.destinationProductId = '00000000-0000-0000-0000-000000000000';
    this.sourceForm.reset();
    this.destinationForm.reset();
    this.cdr.detectChanges();
  }
}