import { HttpErrorResponse, HttpResponse } from '@angular/common/http';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  HostListener,
  ChangeDetectorRef
} from '@angular/core';
import {
  UntypedFormGroup,
  UntypedFormArray,
  UntypedFormBuilder,
  Validators,
  FormArray,
} from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Customer } from '@core/domain-classes/customer';
import { CustomerResourceParameter } from '@core/domain-classes/customer-resource-parameter';
import { DeliveryStatusEnum } from '@core/domain-classes/delivery-status-enum';
import { Operators } from '@core/domain-classes/operator';
import { Product } from '@core/domain-classes/product';
import { ProductResourceParameter } from '@core/domain-classes/product-resource-parameter';
import { SalesOrder } from '@core/domain-classes/sales-order';
import { SalesOrderItem } from '@core/domain-classes/sales-order-item';
import { SalesOrderItemTax } from '@core/domain-classes/sales-order-item-tax';
import { SalesOrderStatusEnum } from '@core/domain-classes/sales-order-status';
import { Tax } from '@core/domain-classes/tax';
import { UnitConversation } from '@core/domain-classes/unit-conversation';
import { ClonerService } from '@core/services/clone.service';
import { TranslationService } from '@core/services/translation.service';
import { environment } from '@environments/environment';
import { QuantitiesUnitPriceTaxPipe } from '@shared/pipes/quantities-unitprice-tax.pipe';
import { QuantitiesUnitPricePipe } from '@shared/pipes/quantities-unitprice.pipe';
import { IDetect } from 'ngx-barcodeput';
import { ToastrService } from 'ngx-toastr';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  tap,
} from 'rxjs/operators';
import { BaseComponent } from '../base.component';
import { CustomerService } from '../customer/customer.service';
import { ProductService } from '../product/product.service';
import { SalesOrderService } from '../sales-order/sales-order.service';
import { CommonError } from '@core/error-handler/common-error';
import { Guid } from 'guid-typescript';
import { SalesOrderListComponent } from '../sales-order/sales-order-list/sales-order-list.component';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-pos',
  templateUrl: './pos.component.html',
  styleUrls: ['./pos.component.scss'],
  viewProviders: [QuantitiesUnitPricePipe, QuantitiesUnitPriceTaxPipe],
})
export class PosComponent
  extends BaseComponent
  implements OnInit, AfterViewInit {
  salesOrderForm: UntypedFormGroup;
  products: Product[] = [];
  filterProducts: Product[] = [];
  customers: Customer[] = [];
  customerResource: CustomerResourceParameter;
  productResource: ProductResourceParameter;
  isLoading: boolean = false;
  isCustomerLoading: boolean = false;
  filterProductsMap: { [key: string]: Product[] } = {};
  unitsMap: { [key: string]: UnitConversation[] } = {};
  unitConversationlist: UnitConversation[] = [];
  taxsMap: { [key: string]: Tax[] } = {};
  totalBeforeDiscount: number = 0;
  totalAfterDiscount: number = 0;
  totalDiscount: number = 0;
  grandTotal: number = 0;
  totalTax: number = 0;
  timeoutclear: any;
  salesOrder: SalesOrder;
  isEdit: boolean = false;
  baseUrl = environment.apiUrl;
  isFromScanner = false;
  currentShiftId: number = 0;
  amountPaid: number = 0;
  balance: number = 0;
  currentOrderNumber: string;
  searchOrderNumber: string = '';
  taxValue: number[] = [];
  isVisa: boolean = false;
  @ViewChild('filterValue') filterValue: ElementRef;
  salesOrderForInvoice: SalesOrder;
  casher: object;
  salesSummary: any = {};
  drawerBalance: number = 0;
  deficit: number = 0;
  @ViewChild("printSection") printSectionRef: ElementRef;
  @ViewChild('barcodeInput') barcodeInput!: ElementRef;
  enteredPassword: string = '';
  modalCallback: Function | null = null;
  currentShift: any;

  get salesOrderItemsArray(): UntypedFormArray {
    return <UntypedFormArray>this.salesOrderForm.get('salesOrderItems');
  }

  constructor(
    private fb: UntypedFormBuilder,
    private customerService: CustomerService,
    private toastrService: ToastrService,
    private salesOrderService: SalesOrderService,
    private router: Router,
    private productService: ProductService,
    private route: ActivatedRoute,
    private quantitiesUnitPricePipe: QuantitiesUnitPricePipe,
    private quantitiesUnitPriceTaxPipe: QuantitiesUnitPriceTaxPipe,
    public translationService: TranslationService,
    private clonerService: ClonerService,
    private changeDetector: ChangeDetectorRef
  ) {
    super(translationService);
    this.getLangDir();
    this.customerResource = new CustomerResourceParameter();
    this.productResource = new ProductResourceParameter();
  }

  ngOnInit(): void {
    this.unitConversationlist = [...this.route.snapshot.data['units']];
    this.createSalesOrder();
    this.getProducts();
    this.customerNameChangeValue();
    this.getNewSalesOrderNumber();
    this.salesOrderForm.get('filterProductValue').setValue('');
    this.salesOrderForm.get('amountPaid').valueChanges.subscribe(value => {
      this.calculateBalance();
    });
    this.setFocusOnBarcodeInput();
    this.casher = JSON.parse(localStorage.getItem("authObj")).firstName;
    this.isVisa = false;
    this.amountPaid = 0
      // Ensure ShiftId is a number
  const shiftId = localStorage.getItem('shiftId');
  if (shiftId) {
    this.currentShift = { ShiftId: Number(shiftId) };
  }
  }

  ngAfterViewInit(): void {
    this.filterValue.nativeElement.focus();
    this.salesOrderForm.get('amountPaid').valueChanges.subscribe(value => {
      this.calculateBalance();
    });
    this.setFocusOnBarcodeInput();
  }

  createSalesOrder() {
    this.route.data
      .pipe()
      .subscribe((salesOrderData: { salesorder: SalesOrder }) => {
        this.salesOrder = salesOrderData.salesorder;
        this.isEdit = false;
        this.getCustomers();
        this.salesOrderForm = this.fb.group({
          orderNumber: ['', [Validators.required]],
          filerCustomer: [''],
          deliveryDate: [new Date(), [Validators.required]],
          soCreatedDate: [new Date(), [Validators.required]],
          deliveryStatus: [1],
          customerId: ['', [Validators.required]],
          note: [''],
          termAndCondition: [''],
          salesOrderItems: this.fb.array([]),
          filterProductValue: [''],
          amountPaid: [0, Validators.min(0)],
          IsVisa: [this.isVisa],
          ShiftId: this.currentShift ? Number(this.currentShift.ShiftId) : null,
        });
        console.log("the current shift",this.currentShift)
      });
  }

  setUnitConversationForProduct(id: string, index: number) {
    this.unitsMap[index] = this.unitConversationlist.filter(
      (c) => c.id == id || c.parentId == id
    );
  }

  onSelectionChange(unitId: any, index: number, isFromUI = true) {
    const productId =
      this.salesOrderItemsArray.controls[index].get('productId').value;
    const product = this.filterProducts.find((c) => c.id === productId);
    const unit = this.unitConversationlist.find((c) => c.id === unitId);
    let price = 0;

    if (unit.value) {
      switch (unit.operator) {
        case Operators.Plush:
          price = product.salesPrice + parseFloat(unit.value);
          break;
        case Operators.Minus:
          price = product.salesPrice - parseFloat(unit.value);
          break;
        case Operators.Multiply:
          price = product.salesPrice * parseFloat(unit.value);
          break;
        case Operators.Divide:
          price = product.salesPrice / parseFloat(unit.value);
          break;
      }
      this.salesOrderItemsArray.controls[index].patchValue({
        unitPrice: price,
      });
      this.getAllTotal();
    } else {
      this.salesOrderItemsArray.controls[index].patchValue({
        unitPrice: product.salesPrice,
      });
      this.getAllTotal();
    }
  }

  onProductSelect(product: Product, index: number) {
    let salesOrderItems: SalesOrderItem[] =
      this.salesOrderForm.get('salesOrderItems').value;

    const existingProductIndex = salesOrderItems.findIndex(
      (c) => c.productId == product.id
    );
    let newIndex = existingProductIndex;
    if (existingProductIndex >= 0) {
      let iteamToUpdate = salesOrderItems[existingProductIndex];
      this.salesOrderItemsArray
        .at(existingProductIndex)
        .get('quantity')
        .patchValue(iteamToUpdate.quantity + 1);
    } else {
      newIndex = this.salesOrderItemsArray.length;
      this.salesOrderItemsArray.push(
        this.createSalesOrderItem(this.salesOrderItemsArray.length, product)
      );
    }
    this.setUnitConversationForProduct(product.unitId, newIndex);
    this.getAllTotal();
    this.filterValue.nativeElement.focus();
  }

  createSalesOrderItem(index: number, product: Product) {
    const taxs = product.productTaxes ? product.productTaxes.map((c) => c.taxId) : [];
    const formGroup = this.fb.group({
      productId: [product.id || product.id],
      warehouseId: [product.warehouseId],
      unitPrice: [product.salesPrice || product.salesPrice, [Validators.required, Validators.min(0)]],
      quantity: [1, [Validators.required, Validators.min(1)]],
      taxValue: [taxs],
      unitId: [product.unitId, [Validators.required]],
      discountPercentage: [0, [Validators.min(0)]],
      productName: [product.name || product.name],
    });

    this.unitsMap[index] = this.unitConversationlist.filter(
      (c) => c.id == product.unitId || c.parentId == product.unitId
    );
    this.taxsMap[index] = [...this.route.snapshot.data['taxs']];
    return formGroup;
  }

  public onDetected(event: IDetect) {
    if (event?.type == 'scanner') {
      this.isFromScanner = true;
    } else {
      this.isFromScanner = false;
    }
  }

  getProducts() {
    this.sub$.sink = this.salesOrderForm
      .get('filterProductValue')
      .valueChanges.pipe(
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((c) => {
          if (this.isFromScanner) {
            this.productResource.barcode = c;
          } else {
            this.productResource.name = c;
          }
          this.productResource.pageSize = 12;
          return this.productService.getProducts(this.productResource);
        })
      )
      .subscribe(
        (resp: HttpResponse<Product[]>) => {
          if (resp && resp.headers) {
            if (this.isFromScanner) {
              this.isFromScanner = false;
              if (resp.body.length == 1) {
                this.onProductSelect(
                  this.clonerService.deepClone<Product>(resp.body[0]),
                  null
                );
                this.toastrService.success('Product Added Successfully');
              } else {
                this.toastrService.warning('Product not found');
              }
              this.productResource.barcode = '';
              this.salesOrderForm.get('filterProductValue').patchValue('');
            } else {
              this.filterProducts = this.clonerService.deepClone<Product[]>(
                resp.body
              );
            }
          }
        },
        (err) => {
          this.isFromScanner = false;
        }
      );
  }

  getAllTotal() {
    let salesOrderItems = this.salesOrderForm.get('salesOrderItems').value;
    this.totalBeforeDiscount = 0;
    this.grandTotal = 0;
    this.totalDiscount = 0;
    this.totalTax = 0;
    if (salesOrderItems && salesOrderItems.length > 0) {
      salesOrderItems.forEach((so) => {
        if (so.unitPrice && so.quantity) {
          const totalBeforeDiscount =
            this.totalBeforeDiscount +
            parseFloat(
              this.quantitiesUnitPricePipe.transform(so.quantity, so.unitPrice)
            );
          this.totalBeforeDiscount = parseFloat(totalBeforeDiscount.toFixed(2));
          const gradTotal =
            this.grandTotal +
            parseFloat(
              this.quantitiesUnitPricePipe.transform(
                so.quantity,
                so.unitPrice,
                so.discountPercentage,
                so.taxValue,
                this.taxsMap[0]
              )
            );
          this.grandTotal = parseFloat(gradTotal.toFixed(2));
          const totalTax =
            this.totalTax +
            parseFloat(
              this.quantitiesUnitPriceTaxPipe.transform(
                so.quantity,
                so.unitPrice,
                so.discountPercentage,
                so.taxValue,
                this.taxsMap[0]
              )
            );
          this.totalTax = parseFloat(totalTax.toFixed(2));
          const totalDiscount =
            this.totalDiscount +
            parseFloat(
              this.quantitiesUnitPriceTaxPipe.transform(
                so.quantity,
                so.unitPrice,
                so.discountPercentage
              )
            );
          this.totalDiscount = parseFloat(totalDiscount.toFixed(2));
        }
      });
    }
  }

  onUnitPriceChange() {
    this.getAllTotal();
  }

  onQuantityChange() {
    this.getAllTotal();
  }

  onDiscountChange() {
    this.getAllTotal();
  }

  onTaxSelectionChange() {
    this.getAllTotal();
  }

  onRemoveSalesOrderItem(index: number) {
    this.salesOrderItemsArray.removeAt(index);
    this.getAllTotal();
  }

  getNewSalesOrderNumber() {
    this.salesOrderService.getNewSalesOrderNumber().subscribe((salesOrder) => {
      if (!this.salesOrder) {
        this.salesOrderForm.patchValue({
          orderNumber: salesOrder.orderNumber,
        });
        this.currentOrderNumber = salesOrder.orderNumber
        this.getAllTotal();
      }
    });
  }

  customerNameChangeValue() {
    this.sub$.sink = this.salesOrderForm
      .get('filerCustomer')
      .valueChanges.pipe(
        tap((c) => (this.isCustomerLoading = true)),
        debounceTime(500),
        distinctUntilChanged(),
        switchMap((c) => {
          this.customerResource.customerName = c;
          this.customerResource.id = null;
          return this.customerService.getCustomers(this.customerResource);
        })
      )
      .subscribe(
        (resp: HttpResponse<Customer[]>) => {
          this.isCustomerLoading = false;
          if (resp && resp.headers) {
            this.customers = [...resp.body];
          }
        },
        (err) => {
          this.isCustomerLoading = false;
        }
      );
  }

  getCustomers() {
    if (this.salesOrder) {
      this.customerResource.id = this.salesOrder.customerId;
    } else {
      this.customerResource.customerName = '';
      this.customerResource.id = null;
    }
    this.customerService
      .getCustomers(this.customerResource)
      .subscribe((resp) => {
        if (resp && resp.headers) {
          this.customers = [...resp.body];
          const walkInCustomer = this.customers.find((c) => c.isWalkIn);
          if (!walkInCustomer) {
            this.getWalkinCustomer();
          } else {
            this.salesOrderForm.get('customerId').setValue(walkInCustomer.id);
          }
        }
      });
  }

  getWalkinCustomer() {
    this.customerService.getWalkInCustomer().subscribe((c) => {
      if (c) {
        this.customers.push(c);
        this.salesOrderForm.get('customerId').setValue(c.id);
      }
    });
  }

  onSaveAndNew() {
    this.changeDetector.detectChanges();
    this.onSalesOrderSubmit(true);
  }

// Method to start a shift and submit a sales order
onSalesOrderSubmit(isSaveAndNew = false) {
  if (!this.salesOrderForm.valid) {
    this.salesOrderForm.markAllAsTouched(); // Mark fields as touched to show validation errors
    return;
  }

  const salesOrder = this.buildSalesOrder();
  let salesOrderItems = this.salesOrderForm.get('salesOrderItems').value;

  if (salesOrderItems && salesOrderItems.length == 0) {
    this.toastrService.error(
      this.translationService.getValue('PLEASE_SELECT_ATLEAST_ONE_PRODUCT')
    );
    return;
  }

  if (isSaveAndNew) {
    this.getNewSalesOrderNumber();
    salesOrder.orderNumber = this.currentOrderNumber;
  }

  // Get the ShiftId from localStorage if it exists
  let shiftId = localStorage.getItem('shiftId');

  this.salesOrderService.checkOngoingShift().pipe(
    switchMap((hasOngoingShift: boolean) => {
      console.log("Has ongoing shift: ", hasOngoingShift);
  
      if (!hasOngoingShift) {
        // No ongoing shift, start a new shift
        return this.salesOrderService.startShift().pipe(
          tap((newShift: any) => {
            console.log("New shift started with ID: ", newShift.shiftId);
            localStorage.setItem('shiftId', newShift.shiftId);
            salesOrder.ShiftId = newShift.shiftId; // Assign new shift ID
            this.currentShift = newShift;
          })
        );
      } else {
        // Ongoing shift exists, fetch the latest shift
        return this.salesOrderService.GetLatestShift().pipe(
          tap((latestShift: any) => {
            console.log("Using existing shift with ID: ", latestShift.shiftId);
            localStorage.setItem('shiftId', latestShift.shiftId);
            salesOrder.ShiftId = latestShift.shiftId; // Use existing shift ID
            this.currentShift = latestShift;
          })
        );
      }
    }),
    switchMap(() => {
      // Now add the sales order with the associated shiftId
      console.log("Assigned ShiftId to SalesOrder:", salesOrder.ShiftId);
      return this.salesOrderService.addSalesOrder(salesOrder);
    })
  ).subscribe(
    (response: SalesOrder) => {
      this.toastrService.success(
        this.translationService.getValue('SALES_ORDER_ADDED_SUCCESSFULLY')
      );
  
      const newSalesOrderId = response.id;
      this.generateInvoice(response);
  
      if (isSaveAndNew) {
        this.router.navigate(['/pos']);
        this.ngOnInit(); // Reinitialize the component for a new sales order
      } else {
        this.router.navigate(['/sales-order/list']);
      }
    },
    (error) => {
      this.toastrService.error(
        this.translationService.getValue('FAILED_TO_ADD_SALES_ORDER')
      );
      console.error('Error adding sales order:', error);
    }
  );
}


  reloadCurrentRoute() {
    let currentUrl = this.router.url;
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([currentUrl]);
    });
  }
  toggleVisaCheckbox() {
    this.isVisa = !this.isVisa;
    this.onVisaCheckboxChange();
  }

  onVisaCheckboxChange() {
    // Handle the change in the checkbox here
    console.log('Visa checkbox changed:', this.isVisa);
  }
  buildSalesOrder(): SalesOrder {
    const salesOrder: SalesOrder = {
      id: this.salesOrder ? this.salesOrder.id : '',
      orderNumber: this.salesOrderForm.get('orderNumber').value,
      deliveryDate: this.salesOrderForm.get('deliveryDate').value,
      deliveryStatus: DeliveryStatusEnum.UnDelivery,
      isSalesOrderRequest: false,
      soCreatedDate: this.salesOrderForm.get('soCreatedDate').value,
      salesOrderStatus: SalesOrderStatusEnum.Not_Return,
      customerId: this.salesOrderForm.get('customerId').value,
      totalAmount: this.grandTotal,
      totalDiscount: this.totalDiscount,
      totalTax: this.totalTax,
      note: this.salesOrderForm.get('note').value,
      termAndCondition: this.salesOrderForm.get('termAndCondition').value,
      salesOrderItems: [],
      IsVisa: this.isVisa,
      ShiftId: this.currentShift ? Number(this.currentShift.ShiftId) : null,
    };
    console.log('isVisaChecked:', this.isVisa); // Debug line
    const salesOrderItems = this.salesOrderForm.get('salesOrderItems').value;
    if (salesOrderItems && salesOrderItems.length > 0) {
      salesOrderItems.forEach((so) => {
        // Ensure taxValue is an array
        const taxValueArray = Array.isArray(so.taxValue) ? so.taxValue : [];

        salesOrder.salesOrderItems.push({
          discount: parseFloat(
            this.quantitiesUnitPriceTaxPipe.transform(
              so.quantity,
              so.unitPrice,
              so.discountPercentage
            )
          ),
          discountPercentage: so.discountPercentage,
          productId: so.productId,
          unitId: so.unitId,
          quantity: so.quantity,
          warehouseId: so.warehouseId,
          taxValue: parseFloat(
            this.quantitiesUnitPriceTaxPipe.transform(
              so.quantity,
              so.unitPrice,
              so.discountPercentage,
              taxValueArray,
              this.taxsMap[0]
            )
          ),
          unitPrice: parseFloat(so.unitPrice),
          salesOrderItemTaxes: taxValueArray.map((element) => ({
            taxId: element,
          })),
        });
      });
    }

    return salesOrder;
  }

  OnCancel() {
    this.router.navigate(['/pos']);
    this.ngOnInit();
  }

  //new methods added august
  onSearchBillNumber(orderNumber: string) {
    const formattedOrderNumber = `SO#${orderNumber.trim()}`;

    this.salesOrderService.getSalesOrderByOrderNumber(formattedOrderNumber).subscribe(
      (salesOrder: SalesOrder) => {
        console.log('Sales Order Received:', salesOrder);
        this.populateForm(salesOrder).then(() => {
        }).catch(error => {
          console.error('Error populating form:', error);
        });
        this.currentOrderNumber = formattedOrderNumber;
        this.salesOrder = salesOrder;
      },
      error => {
        console.error('Error fetching sales order:', error);
      }
    );
  }


  onPreviousBill() {
    this.salesOrderService.getPreviousSalesOrder(this.currentOrderNumber).subscribe((salesOrder: SalesOrder) => {
      if (salesOrder) {
        this.populateForm(salesOrder).then(result => {
          console.log("Populated Sales Order Items with Taxes:", result);
          this.currentOrderNumber = salesOrder.orderNumber;
          this.salesOrder = salesOrder;
        }).catch(error => {
          console.error("Error populating form:", error);
        });
      }
    });
  }

  onNextBill() {
    this.salesOrderService.getNextSalesOrder(this.currentOrderNumber).subscribe({
      next: (salesOrder: SalesOrder | null) => {
        if (salesOrder) {
          this.populateForm(salesOrder).then(result => {
            console.log("Populated Sales Order Items with Taxes:", result);
            this.currentOrderNumber = salesOrder.orderNumber;
            this.salesOrder = salesOrder;
          }).catch(error => {
            console.error("Error populating form:", error);
          });
        } else {
          this.router.navigate(['/pos']);
          this.ngOnInit();
        }
      },
      error: (error) => {
        console.error('An error occurred:', error);
      }
    });
  }

  populateForm(salesOrder: SalesOrder): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!salesOrder) {
        reject('No sales order provided');
        return;
      }

      // Patch sales order details
      this.salesOrderForm.patchValue({
        id: salesOrder.id,
        orderNumber: salesOrder.orderNumber,
        deliveryDate: salesOrder.deliveryDate,
        deliveryStatus: salesOrder.deliveryStatus,
        isSalesOrderRequest: salesOrder.isSalesOrderRequest,
        soCreatedDate: salesOrder.soCreatedDate,
        salesOrderStatus: salesOrder.salesOrderStatus,
        customerId: salesOrder.customerId,
        totalAmount: salesOrder.totalAmount,
        totalDiscount: salesOrder.totalDiscount,
        totalTax: salesOrder.totalTax,
        note: salesOrder.note,
        termAndCondition: salesOrder.termAndCondition,
        IsVisa: this.isVisa,
        ShiftId: this.currentShift ? Number(this.currentShift.ShiftId) : null,
      });

      const salesOrderItems = salesOrder.salesOrderItems || [];
      const productIds: string[] = salesOrderItems.map(item => item.productId);

      if (productIds.length > 0) {
        const id: string = salesOrder.id;
        this.salesOrderService.getTaxIdsForProducts(productIds, id).subscribe((taxIdsForProducts: any) => {
          const taxesByItemId = taxIdsForProducts.reduce((acc, tax) => {
            if (!acc[tax.salesOrderItemId]) {
              acc[tax.salesOrderItemId] = [];
            }
            acc[tax.salesOrderItemId].push(tax);
            return acc;
          }, {});

          // Clear existing items in the form array
          this.salesOrderItemsArray.clear();

          salesOrderItems.forEach((item, index) => {
            const itemWithTaxes = {
              ...item,
              salesOrderItemTaxes: taxesByItemId[item.id] || []
            };

            // Add form group to the form array
            this.salesOrderItemsArray.push(this.createSalesOrderItemFromSalesOrderItem(index, itemWithTaxes));
            this.setUnitConversationForProduct(item.unitId, index);
          });

          this.getAllTotal();
          resolve(salesOrderItems);
        }, error => {
          reject(error);
        });
      } else {
        // Clear existing items in the form array
        this.salesOrderItemsArray.clear();

        salesOrderItems.forEach((item, index) => {
          // Add form group to the form array
          this.salesOrderItemsArray.push(this.createSalesOrderItemFromSalesOrderItem(index, item));
          this.setUnitConversationForProduct(item.unitId, index);
        });

        this.getAllTotal();
        resolve(salesOrderItems);
      }
    });
  }

  createSalesOrderItemFromSalesOrderItem(index: number, item: SalesOrderItem) {
    const formGroup = this.fb.group({
      productId: [item.productId],
      warehouseId: [item.warehouseId],
      unitPrice: [item.unitPrice, [Validators.required, Validators.min(0)]],
      quantity: [item.quantity, [Validators.required, Validators.min(1)]],
      taxValue: [item.salesOrderItemTaxes.map(tax => tax.taxId)],
      unitId: [item.unitId, [Validators.required]],
      discountPercentage: [item.discountPercentage || 0],
      productName: [item.product?.name],  // Ensure this field is populated
    });

    console.log("Product Name in FormGroup:", formGroup.value.productName);

    this.unitsMap[index] = this.unitConversationlist.filter(
      (c) => c.id === item.unitId || c.parentId === item.unitId
    );
    this.taxsMap[index] = this.route.snapshot.data['taxs'];

    return formGroup;
  }

  // Show modal and set the callback function
  showModal(action: () => void) {
    this.enteredPassword = '';
    this.modalCallback = action;
    const modal = document.getElementById("passwordModal");
    if (modal) {
      modal.style.display = "flex";
    }
  }

  closeModal() {
    const modal = document.getElementById("passwordModal");
    if (modal) {
      modal.style.display = "none";
    }
    this.modalCallback = null;
  }

  // Submit the password and execute the callback if valid
  submitPassword() {
    const correctPassword = 'shehabcenter@123';

    if (this.enteredPassword === correctPassword && this.modalCallback) {
      this.modalCallback();
      this.closeModal();
    } else {
      this.toastrService.error("Wrong password.");
    }
  }

  // onSalesOrderReturnSubmit method
  onSalesOrderReturnSubmit() {
    if (!this.salesOrderForm.valid) {
      this.salesOrderForm.markAllAsTouched();
      return;
    } else {
      if (this.salesOrder && this.salesOrder.salesOrderStatus === SalesOrderStatusEnum.Return) {
        this.toastrService.error("Sales Order can't be edited because it's already approved.");
        return;
      }

      this.showModal(() => {
        console.log("Executing Sales Order Return after password validation...");
        const salesOrder = this.buildSalesOrder();
        if (salesOrder.id) {
          this.salesOrderService.updateSalesOrderReturn(salesOrder)
            .subscribe((c: SalesOrder) => {
              this.toastrService.success('Sales order return added.');
              this.router.navigate(['/pos']);
              this.ngOnInit();
            });
        }
      });
    }
  }

  // endShift method
  endShift(): void {
    this.showModal(() => {
      console.log("Executing endShift after password validation...");
      this.salesOrderService.endShift().subscribe(
        response => {
          this.toastrService.success('Shift ended successfully');

          // Call the service to get the sales summary data
          this.salesOrderService.getSalesSummaryAsync().subscribe(
            summaryData => {
              console.log('Sales Summary:', summaryData);

              // Set the sales summary data to display in the modal
              this.salesSummary = summaryData;

              // Open the sales summary modal
              this.openSalesSummaryModal();
            },
            error => {
              this.toastrService.error("Failed to load sales summary data");
              console.error('Error fetching sales summary:', error);
            }
          );
        },
        (error: Error) => {
          this.toastrService.error("No ongoing shift found for the user");
          console.error('Error ending shift:', error);
        }
      );
    });
  }
  calculateDeficit(): void {
    this.deficit = this.drawerBalance - this.salesSummary.netTotal;
  }
  openSalesSummaryModal(): void {
    const modal = document.getElementById('salesSummaryModal');
    if (modal) {
      modal.style.display = 'block';
    }
  }

  closeSalesSummaryModal(): void {
    const modal = document.getElementById('salesSummaryModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  printSalesSummary(): void {
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(`
        <html>
        <head>
          <title>ملخص المبيعات</title>
          <style>
            body { font-family: Arial, sans-serif; direction: rtl; }
            .sales-summary-print { margin: 20px; text-align: right; }
            .sales-summary-print h2 { margin-top: 0; }
            .sales-summary-print p { margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="sales-summary-print">
            <h2>ملخص المبيعات</h2>
            <p><strong>إجمالي المبيعات النقدية:</strong> ${this.salesSummary.cashSalesTotal}</p>
            <p><strong>المستخدم:</strong> ${this.salesSummary.user}</p>
            <p><strong>إجمالي الإرجاع:</strong> ${this.salesSummary.returnTotal}</p>
            <p><strong>إجمالي مبيعات الفيزا:</strong> ${this.salesSummary.visaSalesTotal}</p>
            <p><strong>صافي النقد:</strong> ${this.salesSummary.netCash}</p>
            <p><strong>إجمالي الخصم:</strong> ${this.salesSummary.totalDiscount}</p>
            <p><strong>الصافي الإجمالي:</strong> ${this.salesSummary.netTotal}</p>
            <p><strong>رصيد الصندوق:</strong> ${this.drawerBalance}</p>
            <p><strong>العجز:</strong> ${this.deficit}</p>
          </div>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      printWindow.print();
    }
  }

  startShift(): void {
    this.salesOrderService.startShift().subscribe(
      response => {
        this.toastrService.success('Shift started successfully');
      },
      (error: Error) => {
        this.toastrService.error("Cannot start a new shift. An ongoing shift exists.");
        console.error('Error starting shift:', error);
      }
    );
  }



  generateInvoice(so: SalesOrder) {
    const soForInvoice = this.clonerService.deepClone<SalesOrder>(so);
    const salesOrderItems = this.salesOrderService.getSalesOrderItems(so.id)
    forkJoin({
      salesOrderItems
    }).subscribe(response => {
      console.log(response.salesOrderItems)
      if (response && Array.isArray(response.salesOrderItems)) {
        soForInvoice.salesOrderItems = response.salesOrderItems;
        debugger
        this.salesOrderForInvoice = soForInvoice;
        console.log(this.salesOrderForInvoice?.orderNumber)
      } else {
        throw new Error('Sales order items not found or invalid format.');
      }
      this.printInvoice(so);
      console.log("GenerateInvoice", this.salesOrderForInvoice);

    }),
      catchError(error => {
        console.error('Error:', error);
        this.toastrService.error("Failed to generate invoice.");
        return of({ salesOrderItems: [] });
      })

  }

  printInvoice(so) {
    this.changeDetector.detectChanges();

    // Create a new window for printing
    const printWindow = window.open('', '', 'width=800,height=600');

    // Set the content of the new window
    printWindow.document.open();
    printWindow.document.write(`
        <html>
        <head>
            <title>Invoice</title>
            <style>
                @media print {
                    body {
                        margin: 0;
                        padding: 0;
                        box-shadow: none;
                        font-family: Arial, sans-serif;
                        text-align: center; /* Center text in the body */
                    }
                    #printSection {
                        width: 75mm; /* Common width for POS receipts */
                        padding: 10px;
                        border: 1px solid #000;
                        border-radius: 5px;
                        box-shadow: 0 0 0 1px #000 inset;
                        color: #000;
                        box-sizing: border-box;
                        display: inline-block; /* Center the div horizontally */
                        text-align: right; /* Align text to the left within the div */
                    }
                    #printSection table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 10px 0;
                    }
                    #printSection th, #printSection td {
                        border: 1px solid #000;
                        padding: 5px;
                        text-align: right;
                    }
                    #printSection th {
                        background-color: #f2f2f2;
                    }
                    .qty-col {
                        width: 10%; /* Adjust width for qty column */
                    }
                }
            </style>
        </head>
        <body onload="window.print();window.close()">
            <div id="printSection">
                <h1>شهــــــاب سنتـــــر</h1>
                <p id="order_number">${this.salesOrderForInvoice?.orderNumber} :رقم الفاتورة</p>
                <p>التاريخ: ${new Date(this.salesOrderForInvoice?.soCreatedDate).toLocaleString()}</p>
                <p style="">${this.casher} :الكاشير</p>
                <table>
                    <thead>
                        <tr>
                            <th>الاجمالي</th>
                            <th>السعر</th>
                            <th class="qty-col">الكمية</th>
                            <th>الصنف</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.salesOrderForInvoice?.salesOrderItems.map(item => `
                            <tr>
                                <td>${item.unitPrice * item.quantity}</td>
                                <td>${item.unitPrice}</td>
                                <td class="qty-col">${item.quantity}</td>
                                <td>${item.productName}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p>عدد الاصناف: ${this.salesOrderForInvoice?.salesOrderItems?.length}</p>
                <p>طريقة الدفع: ${so?.isVisa ? "فيزا" : "كاش"}</p>
                <p>اجمالي الخصم: ${this.salesOrderForInvoice?.totalDiscount}</p>
                <p>الاجمالي: ${this.salesOrderForInvoice?.totalAmount}</p>
            </div>
        </body>
        </html>
    `);
    //printWindow.focus();
    // printWindow.print();
    printWindow.document.close();
  }

  onRemoveAllSalesOrderItems(): void {
    this.salesOrderItemsArray.clear();
    // this.getAllTotal();
  }

  private calculateBalance(): void {
    this.amountPaid = this.salesOrderForm.get('amountPaid').value || 0;
    this.balance = this.amountPaid - this.grandTotal;
  }
  onBarcodeEnter() {
    this.setFocusOnBarcodeInput();
  }

  private setFocusOnBarcodeInput() {
    this.barcodeInput.nativeElement.focus();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (event.key === 'F2') {
      event.preventDefault();
      this.onSaveAndNew();
    }
    else if (event.key === 'F4') {
      event.preventDefault();
      this.OnCancel();
    }
    else if (event.key === 'F7') {
      event.preventDefault();
      this.onSalesOrderReturnSubmit();
    }
    else if (event.key === 'F9') {
      event.preventDefault();
      this.onSalesOrderReturnSubmit();
    }
    else if (event.key === 'Escape') {
      event.preventDefault();
      this.router.navigate(['/']);
    } else if (event.key === 'F10') {
      event.preventDefault();
      this.toggleVisaCheckbox();
    }
  }

  //Import Products From Excel
  onFileChange(event: any) {
    const target: DataTransfer = <DataTransfer>(event.target);
    if (target.files.length !== 1) throw new Error('Cannot use multiple files');

    const reader: FileReader = new FileReader();

    reader.onload = (e: any) => {
      const binaryStr: string = e.target.result;
      const workbook: XLSX.WorkBook = XLSX.read(binaryStr, { type: 'binary' });

      const sheetName: string = workbook.SheetNames[0];
      const worksheet: XLSX.WorkSheet = workbook.Sheets[sheetName];

      const data: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      this.importProducts(data);
    };

    reader.readAsBinaryString(target.files[0]);
  }

  importProducts(data: any[]) {
    data.slice(1).forEach(row => {  // Assuming first row is header
      const product: Product = {
        name: row[0],
        code: row[1],
        barcode: row[2],
        skuCode: row[3],
        skuName: row[4],
        description: row[5],
        productUrl: row[6],
        qrCodeUrl: row[7],
        unitId: row[8],
        purchasePrice: row[9],
        salesPrice: row[10],
        mrp: row[11],
        categoryId: row[12],
        productUrlData: '',               // Set appropriate default or value
        isProductImageUpload: false,      // Set appropriate default or value
        qRCodeUrlData: '',                // Set appropriate default or value
        isQrCodeUpload: false,            // Set appropriate default or value
        productTaxes: [],                 // Initialize as an empty array or set value if available
        warehouseId: row[14],             // Optional based on your type definition
        unit: undefined,                  // Optional, set to undefined if not provided
        categoryName: undefined,          // Optional, set to undefined if not provided
        unitName: undefined               // Optional, set to undefined if not provided
      };

      this.productService.addProudct(product).subscribe(
        (response) => {
          console.log('Product added successfully', response);
        },
        (error) => {
          console.error('Error adding product', error);
        }
      );
    });
  }

}
