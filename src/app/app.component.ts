import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';


import { soundex } from 'soundex-code'
import { TableModule } from 'primeng/table';
import { InputTextModule } from 'primeng/inputtext';
import { FilterService } from 'primeng/api';
import { CsvServiceService } from './csv-service.service';
import { CsvComponent } from './csv/csv.component';
import { PhoneticsearchComponent } from './phoneticsearch/phoneticsearch.component';

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html', 
  imports:[CommonModule, FormsModule, TableModule, InputTextModule, CsvComponent, PhoneticsearchComponent],
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit{
  title = 'angular-tour-of-heroes';


  ngOnInit() {}


}
