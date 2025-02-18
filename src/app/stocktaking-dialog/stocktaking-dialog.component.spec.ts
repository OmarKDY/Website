import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StocktakingDialogComponent } from './stocktaking-dialog.component';

describe('StocktakingDialogComponent', () => {
  let component: StocktakingDialogComponent;
  let fixture: ComponentFixture<StocktakingDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StocktakingDialogComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StocktakingDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
