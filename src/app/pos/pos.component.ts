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
        console.log("the current shift", this.currentShift)
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
    const correctPassword = 'alamira@123';

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
    if (!printWindow) {
      console.error('Failed to open print window');
      return;
    }

    // Your base64 image strings should be passed in or stored somewhere accessible
    const logoBase64 = "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";
    const qrLogoBase64 = "/9j/4AAQSkZJRgABAQEAYABgAAD/4QAiRXhpZgAATU0AKgAAAAgAAQESAAMAAAABAAEAAAAAAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCABLAEsDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7E/bd/bW/aPT/AIKYfET4W/DT4n/Cb4W+Avhr8N7Px5q2reMtCe8igieZo5maVWBVR8rc8AA147b/APBQL9p/xp4D8dar4B/bN/ZB+I+q+A/C2o+LbvRdB8Oyz3k1pZQmWUqN/H8K5PALjNJ/wUIbw34m/wCCtv7WPgbXvHvgX4fXnxJ/Ztt/Dej6h4r1iPTLB7ue5YIrSP6ck7QTgE44r4q/YG/4J96J/wAE3NI/aA8a+LP2k/2YPE1tr3wY8U+GbDTfDXjuG91C6vLm1UxIkbKm7JjK4BJJZQAc0Afo34w/a9/bd+J//BP79nb45fCKTwp4lfxlpGlf8Jd4ctPCj3uo3Fxc3D+deQ7W2xW6RBQR2OTn0+hf2sf+C6XwL/ZF/bL8IfBfxL4p0S31PXhepr2rSapDFaeCZIbVbiBb9WO5TcB1WPHcjPFflj8HP25/FP7FfjP9hPUtJsvHvijSp/2ebkHw9oQlubU3by3SR311bB1QwQkK8sp5SNCe1e8+Kvih8Fv2KvEWifE341fDGy/am+OP7XMM9/cf8K20Wx8V+HYX0dPs/wDxKRPiYIYGjMpBkO+FySAoFAHS/t6fGD/gqL+yVovhvU/BV78PvjhB4knnBg8H+AbiaTSokVGjebc/3XD4XHdDVb9pP/gqX+27+wn4E8E3Xjn4U6t44s/D1za+LfiF4s0Hwv8AZtHXw/LAkk2mIXJ8i9gbzFeUnaOOOK+d/D//AAUV8VeCP+Dbbwb4Otf+FueKfi38e9a8RaJ4RvdGmnu9Vs5rPVRLsZxJ9oGIfkVYgxABGAK8e+Cvir9ojwbD4D+H/wARvHWjfEr4U/DrV7b4jak1trV9qd78RpZfs4ufBsLzMYdQ1BFYhtNYZVt+6gD7H/Yd/wCDgv4ufFuz1P45+MI9D1D4F698VY/hb4f8I2OnpB4g0y4vjHPZXVxdbvLkjigYo4UBnc5GBXVeMv8Agor+094z+P37S09h8d/gJ8Gvhd8EvHw8IwXXjTw88m8ShjADMr4LHbjnkmvN/iH41f8A4KueF/BR+DPhr4Rfs0/Af4bfF7SB4m0jxxZxeFvEN54rs5d7W8MdvugZmt5kjEb4laSMjgLXln7Q/wALfD/7VNv/AMFCPhBL8VvhN8NvFfiD442Gq2H/AAm/iOLSIbiC2EhkKlss2M44UjPBIoA9W/aL/wCCpH7Vvwl/Y4+IPxk8E/tT/st/GHSfhrLpsWsWHhXw1JNPAb66W2h3MX2rlizDPURtjmv2x8B6vN4g8D6Nf3JU3F9YwXEpUYUu8ascDsMk1/Lzq/7Juhf8E7f+CMP7WHhjWPjt8AfiD4i+Jl54RfRtN8FeMIdVu3FlqpectHhW4SYN8oPCMTjFf0+fCn/kl3hr/sFWv/olaAPjL9pj9nr4MfGb/goXrz/Hr4c/s1ah4Rh8J2Z0vxB4j1C1/wCEnuL0TMDbyQzONtqsZco20c9zzj4U/bX+If7IP7NP7fkPwj8KfsvfAD4gaBr3w+OsaLq+j6RDqAt/EEt1Lb28N/LFKIrfT12I00p+aNX3dMV6P/wXr/Z4+Av7Qf7b/gPUNQ8MWWteKfhTc6d4x+NE8huo2tvAMPmLI5wwWUBj/q7cGc+mK/PvxZ8C/iZ/wT38NT+KPh38C/D1h4G+PvxGOmeFfFn/AAlUKXPizwZrB/0fw1JZu7Nb2t1CkbNcSKksZ4LKRQB9Q6T8W/EH7OH7a3wk+M/x58M/ATw78KfAvha5+Fll4Y+E/iS21pzFqJlSFfsRnLeSGkYOQcKvYmvE/wBqv/go/wCIP+CT/wDwWS+KPgL4W/CDwh46sfA93bWvw60i+try4/4QCK40qOS+j0iGBx9nW5NxI8wRfmIz614X/wAFgPij+zx8JPDfh3wJ8J/2e/DXw2+MWhSQXHjTVNO1y/v28GazbXEgl0uNpS1vdIQqN5yMVPbPNep/8EzvCXxr+P37WngT9sX4TyXH7TXxo0pbx/idoervb+F4dDubi1m0/T0W6fZHc+ZbKX/coQpiCty1AHFS6L8F9d1Pwx8P/g78d/2qvC3xn0S/lv8AwHpXjKKz8NaB4d1O7IluJTOZQ9msiGQ+YoBY7Mk5r768R6nL8RP+CWfxa8Q+GPg94a8F/Dr4OeDrnXvDPi6S3ksPFEPxCt4rdbzVLcByNjkvJHeJhnIBzyQPh/UP+CYXin9vH45+M/Hf7S3xX8ba748E8djqx+GfgG78cjRJIF8o29/d2MaWSPDGiKY4JJXG078MMH23xx+3Z+1LpH/BMT4vfBC98I6J8ePh7F4Q1aWL4rWuux2cWn6FAYbQwNamGNku7XdGHtJdtwpkyylcMQDyuf8AbW1D9n3wF8NfEOq/D3w58Tfizrmlab4tg8DaW8viHwv4g3pvPi7VxDM0yeJ/OUo5YDaj5OC2K+j/AA74M+Nf7cvgTV/jdP8AsS/sQ+JbnWLeTXtdn1S7lOtQSbGkcXkLSmSKcqhJR8NXzn/wRq8IeFv2sdTm1n9nz4hyfswftIeCfAFxoy6BpGn/ANrRfEFLeKB5NRnu74iC1kurpokaJeE8sMvGa+o/+CcXjX9oj9gHRfjN4L+J/gDSviT+03+0VrMfiSw8MXviKytLfxJpqQSxajcy39sWtbdkBOInZGfPyKaAPnn/AIec/si6t+xPod/pP7EHgO9/aJ15C1joy+AXbwxqGy72zG3mWUzyBLYFjtBxIMHjmv6TPAVz9t8DaLMbaOyMthA/2dFKrBmNTsAPIA6YPpX49fDLwc37WGvfB/4NfCL4X6H8Bfin+z+uoWfiXxHpOvjV7n4GPfSSXCQ2Udw/k6sNRhWRJGUyCETNyCBX7J6RaTWGk2sFxcNdzwxJHJOyhTMwABcgcAk8496APyB/4K3eIdB1H9uT472+k+HH0+98F/BqHxD8ULqTUncfEbwksjiXw7Cm0jTpXbkXsRMg6YxXwX8Wb29/b3/4KB/Cez1r9iPxt4i8L6T8C9PTwj8Obf4gG1uptFiuXFnrC3yqrGMJIYtjjcx5PNfqb+1nYfCv4jf8FA/2ovCEvwz+I3jL4h6h8AY01mHRNXRf+Ei0qScqun2cGwtHds5GJDuBzjb6/mb8Ffj94m8KeC/EXgb9lXwTrUGmS6rP4R8e/CXWR/bvxUjsjGIdUu7S8WINZ2KxCG2RQf3Vzufb81AGZ4v/AGZvBf7Lf7GfxV13V9U07UPg7qfju207xd8E2M8Wr/DjxBNDPFZC41ogy3JsRl3SMbJ9pB9a1P2Iv2x/E/wr+B3x3+Bnhf8Aaa8KeMfh38IvCTJ4Lt9L8JJY3WuJcyJNeavb3Dx+fG2mie4kw7ltyhl+VOO4/Zo/ZY+IPwL/AGfPi43gL42/AH4afDDx34pSx8QeEviraz6x4g8H6ncRPDb6bfStAVS+VCRkD7wJHeu38MfHbwd+wR+wn8bv2UPGngg6J4n+CHhKXwz4i+NGi+Fv7asEn1t90Ee1EjuEL2980atK6qWhIzgigD7Z8NftDad/wSI/ar8X+H/ib4ps/BH7Kd34N0gfCUw6Vu0fTZbOBxqFo91Epb7bMxE6rJk3O/KMXVlPgH/BXfxT4e+I3w/+NPif4I+KLO28N/HD9ne98ceJJbO0zb6ulhqNlFaXjxOAUmubW4vLUyFQ5WFc8xDFvRv26/iBonw5TQdM+Jngz4ifAWGwtLF/iL4m+C803gPToUhSNkS8tL8R+VDIBCy3SllmBUuR0+a/2vfi3+zz+1Z4M+MXwS0j4la98XPjHrvhq01/Q/GeiavDZWHjjWIla203wtY6dbqQltb/AGh2is1JBdndmZyGoA+M/wDgkl/wShtPib+0vqvhz9ofw9qHhHwz4g+C2qfEbw7qd1dSRR29sBD9l1Yi3kDyQoGkfy2I3BeV6V9MfA3/AIJVfEXT/wDgjf8AHbw94a0q9+JHhjxL8RPD2veGfEllELSPxRoFtvNzqMCSSebFEEySrEOPQ14B/wAEdv2KPBni342a9cfHT40+Hfhr468HXFz4Q8OeCvEWq3Fpq8evRPB9jE8BUrJYrcb4pLckbirLj1/Q/wDY4/Y81TwD/wAFXL6/8cTXPhXxrY+HPEdnrnhQ389tD8VJ5rSdZNQ8NWflrHDYqPlCn7rYwMjgA7H/AIJ2fs9fsU2v/BQb4ea7+yF8MdU+Ja6B9qfxN48sfGGpC08ANNazpbC4tLv/AI+ftIWdF2/cKE9q/ZGv51LqQaZ+17+w/wDCz9lNLX4H/Ffw1aeKrXWfDXjc/btR8O3Dh5o01pYkUzNJAZXh3qdqyJgDFf0RaNHdQ6PaJfSRS3qwoLh412o8m0bio7AnOKAPgj/gpj+0Fp2m/FPxr8I/h58K/iZY/H/4reEk8M6L8T9E8LPHpemvdb1tVutYiPmwxQS4dyA3l/eAzX5x/sbf8Ervjj/wRW+NnjX40/HVfFPjvS/iV4d1TwZcXfwne61/xda3+o7Zf7QAeKMoV8iRvPLErK0fBzX0/wD8FGfHHjzxl/wVT+M2iz/tH/F74LfC74RfB2z8fXkPg51lLlJ3SciFuCxQ545JUV8yfCj9pfTP2rPCXxOh+EX7f/7W+t+L/h/4D1jxvHZavpqWNrcx2EHmFGkycZdoxgc4JI6UAezeHPhT4D+CHw4sPgd8KbLxZ4u+JP7UcCfFbUbr9oS1jl/sWwtlmiu7qeRQskGpxKjyRsyuFcBi4rxH9mrQPgL4l/aZ/bM/Zp8dfE34m+NfhT8U9S8Ln/hb0msWupWlqLC1+2K2o60+beMvOFt4yykOVEYw1ehS/Ga8v/DH7IfxsvtVufHvx0vvgzNb6jp/jBTF4d1vRbhrr+0ZrjUCy5vtm8RwZJkO3g557f8A4Jyfth/si/tFftOfE/8AZksP2edF8GfDv4tTWL+FbWTwldWQ8Zpp9pLfTvqKyttRraaMmLb1yDwSMgHkHjD9nP4pf8Emfh144uP2dfHHwZ/aI/Zg8a2cFn4b8D+OfEDeKLvxBcxSI19Dpum2oSC4mFy7s6x7jsQFhla+avGPws+H3wK/4J06nba54P8AHa/HXwjrN78RNA+Ifwf0dLjw9olxcwxSQabf6qqiS3+xvnzIBgwNt+bNfQP7JPwi+DnjD9lP4n+Hv2d/jd421zx74DtzefC+X4h29v4W0/wXqM9/m8n0m6kYIJpEV1k284C5xmvDPCf7dXjr9tX4Wa5+yDZ+Gpfgdq+oxTx2Nv4FtbhoPiLrt20VoRq8sjFEs7g7pXuRhcgHOKAE+Dz/AAo/Z4/YX0X9tH4S6R4m+MXxwm8Y2HgfxNpvxW06DWtMn167tRfXN7ZRRYneYXCJ5MrS7/nfKljmu2+In/Bf39skeNNG8V/EH9mbwR4Tv1/4py28Z6j8PdVsdQ0WG9fynjt72aYeSzZJABwWHQ9K2vFn7CHxH/4JBf8ABHHwpp3xo06y0+8i/aa8O+KVj0e8XU3eyjsyGKiPrJmCTCDk8etVv+CuH/BX34MftF/sw/FTwJ4d+Lnxn8VeJfHHxC0nxBYaP4k8PPZxeC7a3n3S2tpu5CqPmCsMllXjOTQB7x4++AX7IP8AwR1/4KfeB/G9948/aX+PXx/klvbkaZpd5Y+KtR84WnkuuoRKsdyJDBPuQE5Kx56LX7j6RqS6xpNrdrHNCt1CkwjmXZIgZQcMOxGeR61+P3wm/YM0T4teC/hZ+1Z+zP4hm+K37Q/w7N9JejxyItJ1LxvJeTPZtJrmGEsElvaiXyB8u9Y06hs1+wGiy3U2j2j30cUN68KNcRxtuSOQqNwU9wDnBoA/EL/gqr+0b8Ifgv8A8FfP2jvCvxj8cXnw90L4vfs/2ng2z1i30S41Zraee4clvJhBJ2orHkqDjGRXxL+yXqn7Fn/BPXQfjR4h8L/tUa58RvEXjb4WeIfBWm6NL8NtR0tJbm+twImMzFwPnRV5AHz5JGK/qL1fwNoniC8+0X+j6VfXG0L5txaRyvgdBlgTiqv/AAqrwv8A9C3oH/gvh/8AiaAPw6+MXx/+COpf8EIf2U/gh8RPiNe+BfG+seHNF8ZeHLeLw7daomryWk0qw2rPGAkImm/d72b5AdxBFfRPjr9pzwX8V/i/4I/aS+O+uTfB3x5+xHFe2nxJ8C2emza3DZzeIYvstiiXkQxKGiMMhMKyAGQqxXaTX6iXPgDQrxbYTaLpMos1CW4ezjYQKDkBMj5RnnAqe68J6VerdibTNPmGoFTdB7dG+0lful8j5sds5xQB/NF+1D4p+CP/AAVU/wCCLt3qXwztrX4Pa5+yxNqnijUfAOn2l5qFpPFqmoRwRyC9uCuDJtMpC79pYrtUAV53+wN8ef21vCPwC+MH7Vnh7QZ/GWjD4ezfD7/hNp9WsbK48I21gbeRZobbhpmgVEABjO7cTkkGv6mrX4faBY21xBDoekQw3ahJ40s41WZQcgMAMMM9jU9r4T0qx0eXT4NM0+Gwmz5lsluiwyZ65QDBz34oA/llt/8Agt9f/wDBSj43fBrRv2ivibqPwi+GPwns9K1m/ntNIk18eLtf0yZWS7liijWSGW4V5QdpMabfunIr6Ivf+CDF/wD8FP8A44/G79rhfG1x4Q8Aa/r8/jXwGx0pLr/hK9NCtcLMymZJbXLRhNskYf5s7eOf6BP+FVeF/wDoW9A/8F8P/wATWva6XbWOnraQW8ENoieWsKRhY1X+6FHGPagD8rv+CY37QXgz4F/s0/GD/goZ8VtdHhTw9+0bc6Zfapolnp098nhlrK4m0uJEkQNLcec7KxPlqF3dwCa/VDR9Vg13SbW+tmL215Ck8TEEFkZQynB5HBFQN4U0ttEGmHTbA6aOlobdPIHOfuY29eenWryII1CqAqqMAAYAFAH/2Q==";

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
                text-align: center;
            }
            #printSection {
                width: 75mm;
                padding: 10px;
                border: 1px solid #000;
                border-radius: 5px;
                box-shadow: 0 0 0 1px #000 inset;
                color: #000;
                box-sizing: border-box;
                display: inline-block;
                text-align: center;
            }
            img {
                display: block !important;
                max-width: 35mm !important;
                max-height: 35mm !important;
                visibility: visible !important;
            }
            #printSection img {
                width: 50mm;
                height: auto;
                display: block;
                margin: 0 auto;
            }
            #printSection table {
                width: 100%;
                border-collapse: collapse;
                margin: 10px 0;
                display: table !important;
            }
            #printSection th, #printSection td {
                border: 1px solid #000 !important;
                padding: 5px;
                text-align: right !important;
                display: table-cell !important;
            }
            #printSection th {
                background-color: #f2f2f2;
            }
            .qty-col {
                width: 10%;
            }
            @page {
                size: 80mm auto;
                margin: 0;
            }
        }
    </style>
</head>
<body>
    <div id="printSection">
        <img id="logo" class="img-responsive" style="display:block; height:25mm; width:25mm" alt="Company Logo">
        <h1>مــحـلات الأميـــرة</h1>
        <p id="order_number">${this.salesOrderForInvoice?.orderNumber || ''} :رقم الفاتورة</p>
        <p>التاريخ: ${new Date(this.salesOrderForInvoice?.soCreatedDate).toLocaleString('ar-SA')}</p>
        ${this.casher ? `<p>${this.casher} :الكاشير</p>` : ''}
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
                ${this.salesOrderForInvoice?.salesOrderItems?.length ?
        this.salesOrderForInvoice.salesOrderItems.map(item => `
                        <tr>
                            <td>${(item.unitPrice * item.quantity).toFixed(2)}</td>
                            <td>${item.unitPrice.toFixed(2)}</td>
                            <td class="qty-col">${item.quantity}</td>
                            <td>${item.productName}</td>
                        </tr>
                    `).join('')
        : '<tr><td colspan="4">لا توجد عناصر</td></tr>'}
            </tbody>
        </table>

        <p>عدد الاصناف: ${this.salesOrderForInvoice?.salesOrderItems?.length || 0}</p>
        <p>طريقة الدفع: ${so?.isVisa ? "فيزا" : "كاش"}</p>
        <p>اجمالي الخصم: ${(this.salesOrderForInvoice?.totalDiscount || 0).toFixed(2)}</p>
        <p>الاجمالي: ${(this.salesOrderForInvoice?.totalAmount || 0).toFixed(2)}</p>
        <hr>
<div id="footer" style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-top: 10px;">
    <img id="QRlogo" class="img-responsive" style="display: block; height: 25mm; width: 25mm;" alt="QR Logo">
    <div style="text-align: right; flex-grow: 1;">
        <p style="margin: 0; font-weight: bold;">📞 واتساب: +1234567890</p>
        <p style="margin: 0;">🏠 العنوان: شارع الأمير، المدينة</p>
    </div>
</div>
    </div>
    <script>
        (function() {
            let imagesLoaded = 0;
            const totalImages = 2;
            
            function checkAllImagesLoaded() {
                imagesLoaded++;
                if (imagesLoaded === totalImages) {
                    // Allow some time for the images to render properly
                    setTimeout(() => {
                        window.print();
                        // Only close after printing is complete
                        window.addEventListener('afterprint', function() {
                            window.close();
                        });
                    }, 500);
                }
            }

            function loadImage(imgElement, base64String) {
                if (!base64String) {
                    console.error('Missing base64 string for ' + imgElement.id);
                    checkAllImagesLoaded(); // Count as loaded even if failed
                    return;
                }
                
                try {
                    imgElement.src = 'data:image/jpeg;base64,' + base64String;
                    imgElement.onload = checkAllImagesLoaded;
                    imgElement.onerror = () => {
                        console.error('Failed to load image: ' + imgElement.id);
                        checkAllImagesLoaded(); // Count as loaded even if failed
                    };
                } catch (error) {
                    console.error('Error loading image:', error);
                    checkAllImagesLoaded(); // Count as loaded even if failed
                }
            }

            // Load both images
            loadImage(document.getElementById('logo'), '${logoBase64}');
            loadImage(document.getElementById('QRlogo'), '${qrLogoBase64}');
        })();
    </script>
</body>
</html>
    `);
    // printWindow.focus();
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
