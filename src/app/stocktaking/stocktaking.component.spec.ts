import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StocktakingComponent } from './stocktaking.component';

describe('StocktakingComponent', () => {
  let component: StocktakingComponent;
  let fixture: ComponentFixture<StocktakingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ StocktakingComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StocktakingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
