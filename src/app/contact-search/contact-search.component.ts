import { Component, OnDestroy, OnInit,Inject, PLATFORM_ID, afterNextRender  } from '@angular/core';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Contact } from '../csv1services/contact-search.model';
import { LocalContactSearchService } from '../csv1services/local-contact-search.service';
import { isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-contact-search',
  templateUrl: './contact-search.component.html',
  imports: [FormsModule],
  styleUrls: ['./contact-search.component.css']
})
export class ContactSearchComponent implements OnInit, OnDestroy {

  
   // CSV source URL.
  csvUrl = 'https://raw.githubusercontent.com/susmithakundukulam/Test/refs/heads/main/contacts_15000.csv';
  
  downloading = false;

  // All contacts are loaded from the service.
  totalContacts = 0;

  // All contacts retrieved from IndexedDB.
  contacts: Contact[] = [];

  // Contacts matching the current search.
  filteredContacts: Contact[] = [];

  // Current search text.
  searchText = '';

  // Indicates whether contacts are being initialized.
  loading = true;

  // Stores any initialization error.
  errorMessage = '';

  // Emits search text changes.
  private searchInput$ = new Subject<string>();

constructor(
    private contactService: LocalContactSearchService,
    @Inject(PLATFORM_ID) private platformId: Object
) {

}


  // Initialize contacts and subscribe to search input changes.
  // Subscribe to search input and load existing contacts after rendering.
ngOnInit(): void {

    this.searchInput$
        .pipe(
            debounceTime(150),
            distinctUntilChanged()
        )
        .subscribe(value => this.performSearch(value));

        console.log('PLATFORM ID:', this.platformId);

    // Do not execute IndexedDB operations on the server.
    if (!isPlatformBrowser(this.platformId)) {
        console.log('SSR detected. Skipping IndexedDB loading.');
        this.loading = false;
        return;
    }

    this.loadExistingContacts();

}

// Read previously downloaded contacts from IndexedDB.
// Load previously downloaded contacts from IndexedDB.
private async loadExistingContacts(): Promise<void> {

    console.log('LOAD EXISTING CONTACTS STARTED');

    try {

        // Read all contacts from IndexedDB.
        const storedContacts =
            await this.contactService.loadContactsIntoMemory();

        console.log('Records retrieved:', storedContacts.length);

        // Assign retrieved records to component.
        this.contacts = storedContacts;

        // Update total contact count.
        this.totalContacts = storedContacts.length;

        console.log('Component contacts:', this.contacts.length);

    } catch (error) {

        console.error('Contact loading failed:', error);

        this.errorMessage = 'Unable to load contacts.';

    } finally {

        this.loading = false;

        console.log('LOAD EXISTING CONTACTS COMPLETED');
    }
}

  // Receive text entered by the user.
  onSearchChange(value: string): void {

    this.searchText = value;

    // Send the search text to the debounced search pipeline.
    this.searchInput$.next(value);
  }

  // Perform the actual contact search.
  // Search contacts by name or phone number.
  private performSearch(value: string): void {

    // If search is empty, clear search results.
    if (!value.trim()) {
      this.filteredContacts = [];
      return;
    }

    // Get only matching contacts from the service.
    this.filteredContacts =
      this.contactService.searchContacts(value);

    console.log('Matching contacts:', this.filteredContacts.length);
  }

  // Clear the search input and results.
  clearSearch(): void {

    this.searchText = '';

    this.searchInput$.next('');

    this.filteredContacts = [];
  }

  // Clean up the RxJS subscription source when the component is destroyed.
  ngOnDestroy(): void {
    this.searchInput$.complete();
  }


  // Handle the Download Contacts button click.
  // Measure the complete operation, including loading contacts into memory.
  // Handle the Download Contacts button click.
  // Download the CSV, save it to IndexedDB, and read the saved contacts.
  async downloadContacts(): Promise<void> {

    // Prevent multiple simultaneous downloads.
    if (this.downloading) {
      return;
    }

    if (!this.csvUrl.trim()) {
      this.errorMessage = 'Please enter a valid CSV URL.';
      return;
    }

    const totalStartTime = performance.now();

    console.log('CONTACT REFRESH BUTTON CLICKED');
    console.log('Started at:', new Date().toLocaleString());

    this.downloading = true;
    this.errorMessage = '';

    try {

      // Step 1: Download CSV and save it into IndexedDB.
      await this.contactService.downloadAndRefreshContacts(this.csvUrl.trim());

      // Step 2: Read the saved contacts from IndexedDB.
      const loadStartTime = performance.now();

      this.contacts =
        await this.contactService.loadContactsIntoMemory();

      const memoryLoadTime = performance.now() - loadStartTime;

      // Step 3: Update the total contact count.
      this.totalContacts = this.contacts.length;

      // Step 4: Clear previous search.
      this.searchText = '';
      this.filteredContacts = [];

      // Step 5: Log performance information.
      const totalTime = performance.now() - totalStartTime;

      console.log('CONTACTS LOADED FROM INDEXEDDB');

      console.table({
        'Memory Load Time': `${memoryLoadTime.toFixed(2)} ms`,
        'Total Contacts Loaded': this.contacts.length,
        'Complete Button Operation': `${totalTime.toFixed(2)} ms`
      });

    } catch (error) {

      console.error('Contact download failed:', error);
      this.errorMessage = 'Unable to download contacts.';

    } finally {

      this.downloading = false;
    }
  }
}