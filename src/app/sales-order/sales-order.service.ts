import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SalesOrder } from '@core/domain-classes/sales-order';
import { SalesOrderItem } from '@core/domain-classes/sales-order-item';
import { SalesOrderResourceParameter } from '@core/domain-classes/sales-order-resource-parameter';
import { User } from '@core/domain-classes/user';
import { CommonError } from '@core/error-handler/common-error';
import { CommonHttpErrorService } from '@core/error-handler/common-http-error.service';
import { Guid } from 'guid-typescript';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map, switchMap, tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SalesOrderService {

  constructor(private http: HttpClient,
              private commonHttpErrorService: CommonHttpErrorService) { }

  getAllSalesOrder(
    resourceParams: SalesOrderResourceParameter
  ): Observable<HttpResponse<SalesOrder[]>> {
    const url = 'salesOrder';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', resourceParams.pageSize.toString())
      .set('Skip', resourceParams.skip.toString())
      .set('SearchQuery', resourceParams.searchQuery)
      .set('name', resourceParams.name)
      .set('orderNumber', resourceParams.orderNumber)
      .set('customerName', resourceParams.customerName)
      .set('fromDate', resourceParams.fromDate ? resourceParams.fromDate.toDateString() : '')
      .set('toDate', resourceParams.toDate ? resourceParams.toDate.toDateString() : '')
      .set('productId', resourceParams.productId ? resourceParams.productId : '')
      .set('customerId', resourceParams.customerId ? resourceParams.customerId : '')
      .set('status', resourceParams.status);
    return this.http.get<SalesOrder[]>(url, {
      params: customParams,
      observe: 'response'
    });
  }

  getAllSalesOrderExcel(
    resourceParams: SalesOrderResourceParameter
  ): Observable<HttpResponse<SalesOrder[]>> {
    const url = 'salesOrder';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', 0)
      .set('Skip', 0)
      .set('SearchQuery', resourceParams.searchQuery)
      .set('name', resourceParams.name)
      .set('orderNumber', resourceParams.orderNumber)
      .set('customerName', resourceParams.customerName)
      .set('fromDate', resourceParams.fromDate ? resourceParams.fromDate.toDateString() : '')
      .set('toDate', resourceParams.toDate ? resourceParams.toDate.toDateString() : '')
      .set('productId', resourceParams.productId ? resourceParams.productId : '')
      .set('customerId', resourceParams.customerId ? resourceParams.customerId : '');
    return this.http.get<SalesOrder[]>(url, {
      params: customParams,
      observe: 'response'
    });
  }

  addSalesOrder(salesOrder: SalesOrder): Observable<SalesOrder | CommonError> {
    const url = `salesOrder`;
    return this.http.post<SalesOrder>(url, salesOrder)
      .pipe(catchError(this.commonHttpErrorService.handleError));
  }

  updateSalesOrder(salesOrder: SalesOrder): Observable<SalesOrder | CommonError> {
    const url = `salesOrder/${salesOrder.id}`;
    return this.http.put<SalesOrder>(url, salesOrder)
      .pipe(catchError(this.commonHttpErrorService.handleError));
  }

  updateSalesOrderReturn(salesOrder: SalesOrder): Observable<SalesOrder | CommonError> {
    const url = `salesOrder/${salesOrder.id}/return`;
    return this.http.put<SalesOrder>(url, salesOrder)
      .pipe(catchError(this.commonHttpErrorService.handleError));
  }

  deleteSalesOrder(id: string): Observable<void | CommonError> {
    const url = `salesOrder/${id}`;
    return this.http.delete<void>(url)
      .pipe(catchError(this.commonHttpErrorService.handleError));
  }

  getNewSalesOrderNumber(): Observable<SalesOrder> {
    const url = `salesOrder/newOrderNumber`;
    return this.http.get<SalesOrder>(url);
  }

  getSalesOrderById(salesOrderId: string): Observable<SalesOrder> {
    const url = `salesOrder/${salesOrderId}`;
    return this.http.get<SalesOrder>(url);
  }

  getSalesOrderItems(salesOrderId: string, isReturn: boolean = false): Observable<SalesOrderItem[]> {
    const url = `salesOrder/${salesOrderId}/items?isReturn=${isReturn}`;
    return this.http.get<SalesOrderItem[]>(url);
  }

  downloadAttachment(id: string): Observable<HttpEvent<Blob>> {
    const url = `salesOrderAttachment/${id}/download`;
    return this.http.get(url, {
      reportProgress: true,
      observe: 'events',
      responseType: 'blob',
    });
  }

  getSalesOrderItemReport(
    resourceParams: SalesOrderResourceParameter
  ): Observable<HttpResponse<SalesOrderItem[]>> {
    const url = 'salesOrder/items/reports';
    const customParams = new HttpParams()
      .set('Fields', resourceParams.fields)
      .set('OrderBy', resourceParams.orderBy)
      .set('PageSize', resourceParams.pageSize.toString())
      .set('Skip', resourceParams.skip.toString())
      .set('SearchQuery', resourceParams.searchQuery)
      .set('name', resourceParams.name)
      .set('orderNumber', resourceParams.orderNumber)
      .set('customerName', resourceParams.customerName)
      .set('fromDate', resourceParams.fromDate ? resourceParams.fromDate.toDateString() : '')
      .set('toDate', resourceParams.toDate ? resourceParams.toDate.toDateString() : '')
      .set('productId', resourceParams.productId ? resourceParams.productId : '')
      .set('productName', resourceParams.productName ? resourceParams.productName : '')
      .set('customerId', resourceParams.customerId ? resourceParams.customerId : '')
      .set('isSalesOrderRequest', resourceParams.isSalesOrderRequest);
    return this.http.get<SalesOrderItem[]>(url, {
      params: customParams,
      observe: 'response'
    });
  }

  // New methods for previous and next and search sales orders
  getSalesOrderByOrderNumber(orderNumber: string): Observable<SalesOrder | CommonError> {
    const url = `salesOrder/byOrderNumber/${encodeURIComponent(orderNumber)}`;
    return this.http.get<SalesOrder>(url)
      .pipe(catchError(this.commonHttpErrorService.handleError));
  }

  getPreviousSalesOrder(orderNumber: string): Observable<SalesOrder | CommonError> {
    const url = `salesOrder/previous/${encodeURIComponent(orderNumber)}`;
    return this.http.get<SalesOrder>(url)
      .pipe(
        catchError(error => {
          this.commonHttpErrorService.handleError(error);
          return throwError(error);
        })
      );
  }


  getTaxIdsForProducts(productIds: string[], id: string): Observable<{ [key: string]: string[] }> {
    return this.http.post<{ [key: string]: string[] }>(`salesOrder/GetTaxIdsForProducts`, { productIds, id });
}

  
  getNextSalesOrder(orderNumber: string): Observable<SalesOrder | null> {
    const url = `salesOrder/next/${encodeURIComponent(orderNumber)}`;
    return this.http.get<SalesOrder>(url, { observe: 'response' })
      .pipe(
        map(response => {
          if (response.status === 204) {
            return null;
          }
          return response.body as SalesOrder;
        })
      );
  }

  getCurrentUser(): Observable<User | CommonError> {
    const url = `user/GetCurrentUser`;
    return this.http.get<User>(url).pipe(
      catchError(error => {
        // Return an observable of CommonError
        return of(this.commonHttpErrorService.handleError(error) as unknown as CommonError);
      })
    );
  }

  startShift(): Observable<any> {
    const url = `salesOrder/StartShift`;
    return this.http.post<any>(url, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error starting shift:', error);
        let errorMessage = 'An error occurred while starting the shift.';
        if (error.status === 400) {
          errorMessage = 'Cannot start a new shift. An ongoing shift exists.';
        } else if (error.error && typeof error.error.message === 'string') {
          errorMessage = error.error.message;
        }
        return throwError(() => new Error(errorMessage));
      })
    );
  }
  

  endShift(): Observable<any | CommonError> {
    const url = `salesOrder/EndShift`;
    return this.http.post<any>(url, {}).pipe(
      catchError((error: HttpErrorResponse) => {
        console.error('Error starting shift:', error);
        let errorMessage = 'An error occurred while starting the shift.';
        if (error.status === 404) {
          errorMessage = 'No ongoing shift found for the user.';
        } else if (error.error && typeof error.error.message === 'string') {
          errorMessage = error.error.message;
        }
        return throwError(() => new Error(errorMessage));
      })
    );
  }
  

  private isCommonError(value: any): value is CommonError {
    return (value as CommonError).messages !== undefined;
  }
}
