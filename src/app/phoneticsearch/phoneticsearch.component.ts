import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';
import { soundex } from 'soundex-code';

@Component({
  selector: 'app-phoneticsearch',
  imports:[CommonModule, FormsModule, TableModule, InputTextModule],
  templateUrl: './phoneticsearch.component.html',
  styleUrl: './phoneticsearch.component.css'
})
export class PhoneticsearchComponent {

    searchQuery: string = '';

    // APPROACH 1

    //  ngOnInit(){}

    //   people = [
    //     { name: 'susmitha' },
    //     { name: 'tom' },
    //     { name: 'christo' },
    //     { name: 'siji' },
    //     { name: 'smitha' },
    //     { name: 'sushmitha' },
    //      { name: 'rismy' },   ];

    //   get filteredPeople() {
    //     if (!this.searchQuery.trim()) {
    //       return this.people;
    //     }

    //     // Use the library to get the phonetic code for the search term
    //     const searchKey = soundex(this.searchQuery);

    //     return this.people.filter(person => {
    //       // Use the library to get the phonetic code for each dataset item
    //       return soundex(person.name) === searchKey;
    //     });
    //   }
    

    
    // APPROACH 2
  // searchMode = 'contains';

  // people = [
  //   { name: 'susmitha' },
  //   { name: 'tom' },
  //   { name: 'christo' },
  //   { name: 'siji' },
  //   { name: 'smitha' },
  //   { name: 'sushmitha' },
  //   { name: 'rismy' }
  // ];


  // constructor(private filterService: FilterService) {}

      

  // ngOnInit() {

  //   debugger
  //  this.filterService.register('soundexContains', (value :any, filter :any): boolean => {

  //     if (!filter) return true;
  //     if (!value) return false;

  //     const text = value.toString();

  //     return (
  //       text.toLowerCase().includes(filter.toLowerCase()) ||
  //       soundex(text) === soundex(filter)
  //     );
  //   });
  // }
  

    // APPROACH 3
  people = [
    { name: 'susmitha tom' , department : 'finance', 'extension' : '0023'},
    { name: 'tom' , department : 'marketing', 'extension' : '0087' },
    { name: 'christo' , department : 'human resource', 'extension' : '9023' },
    { name: 'siji'  , department : 'human resource', 'extension' : '3023'},
    { name: 'smitha'  , department : 'marketing', 'extension' : '8009'},
    { name: 'sushmitha' , department : 'finance', 'extension' : '8123' },
    { name: 'rismy' , department : 'finance' , 'extension' : '8008'}
  ];

  filteredPeople = [...this.people];

  filterPeople(searchTerm: string) {

    
    if (!searchTerm) {
        this.filteredPeople = [...this.people];
        return;
    }

    const filter = searchTerm.toLowerCase();
    const filterCode = soundex(filter);

    this.filteredPeople = this.people.filter(person => {

        const name = person.name.toLowerCase();

        const nameMatch =
        person.name.toLowerCase().includes(filter) ||
        soundex(person.name) === filterCode;

        const otherMatch =
        person.department.toLowerCase().includes(filter) ||
        person.extension.toLowerCase().includes(filter);

        // return (
        //     name.includes(filter) ||
        //     soundex(name) === filterCode
        // );
        return nameMatch || otherMatch;
    });
  }
}
