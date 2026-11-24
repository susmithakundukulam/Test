import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PhoneticsearchComponent } from './phoneticsearch.component';

describe('PhoneticsearchComponent', () => {
  let component: PhoneticsearchComponent;
  let fixture: ComponentFixture<PhoneticsearchComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PhoneticsearchComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PhoneticsearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
