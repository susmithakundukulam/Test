import { Component } from '@angular/core';
import { CsvServiceService } from '../csv-service.service';
import { Contact, ContactDbService, SearchMode } from '../contact-db.service';

@Component({
  selector: 'app-csv',
  imports: [],
  templateUrl: './csv.component.html',
  styleUrl: './csv.component.css'
})
export class CsvComponent {

  contacts: Contact[] = []; // Holds the contacts currently displayed in the table.

  searchText = '';

  searchMode: SearchMode = 'both';

  private searchRequestId = 0;

  constructor(
    private csvService: CsvServiceService,
    private contactDb: ContactDbService
  ) { }


  /**
   * Downloads the latest CSV file from the configured URL.
   *
   * PHASE 1:
   * Replaces the existing IndexedDB contacts with newly downloaded data.
   * Retrieves the updated contacts and displays them immediately.
   *
   * PHASE 2:
   * Builds the bigram search index separately so that users do not
   * have to wait for index creation before seeing the contacts.
   */
  async readCsv() {

    const url ='https://raw.githubusercontent.com/susmithakundukulam/Test/refs/heads/main/contacts_15000.csv';

    // Append a timestamp to generate a unique URL for every download,
    // helping prevent the browser from reusing a cached CSV response.
    const freshUrl = `${url}?_=${Date.now()}`;

    // Download and parse the CSV file.
    this.csvService.readCsvFromUrl(freshUrl).subscribe({

      // Executes when the CSV download and parsing are successful.
      next: async (data) => {

        try {

          console.log('CSV downloaded:', data.length);

          // PHASE 1: Save contacts
          await this.contactDb.replaceContacts(data);

          // Retrieve and display contacts immediately
          const updatedContacts = await this.contactDb.getContacts();

          // Update the Angular component so the new contacts are displayed immediately.
          this.contacts = updatedContacts;

          console.log('Contacts displayed:', updatedContacts.length);

          // PHASE 2: Build the bigram search index separately.
          // This index helps optimize contains searches without scanning every contact.
          await this.contactDb.prepareSearchIndex();

          console.log('CSV refresh and search indexing completed');

        } catch (error) {

          console.error('Refresh failed:', error);

        }
      },
      // Executes if the CSV download or parsing fails.
      error: error => {
        console.error('CSV download failed:', error);
      }
    });
  }


   /**
   * Searches contacts based on the text entered by the user.
   *
   * Uses the configured search mode ('both', 'startsWith', or 'contains')
   * to retrieve matching contacts from IndexedDB.
   *
   * A search request ID ensures that only the latest search response
   * updates the displayed contacts. This prevents older asynchronous
   * searches from overwriting newer search results.
   *
   * If the search field is empty, the displayed contacts are cleared.
   */
  async searchContacts(value: string) {

    this.searchText = value;

    // Generate a unique ID for the current search request.
    const requestId = ++this.searchRequestId;

    // Clear the displayed results when the search field is empty.
    if (!value.trim()) {

      this.contacts = [];

      return;
    }

    // Perform the search using the selected search mode.
    const result = await this.contactDb.searchContacts(
      value,
      this.searchMode
    );

    // Ignore this result if another search was initiated while
    // the current IndexedDB search was still executing.
    if (requestId !== this.searchRequestId) {
      return;
    }

    // Update the table with the latest matching contacts.
    this.contacts = result;
  }


}
