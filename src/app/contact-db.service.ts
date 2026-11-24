import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';

// Represents an individual contact stored in IndexedDB.
export interface Contact {
  id?: number;
  name: string;
  phone: string;
}

// Represents a bigram search-index entry.
// Each entry connects a two-character combination (gram)
// to the ID of the contact containing that combination.
interface ContactGram {
  id?: number;
  gram: string;
  contactId: number;
}

// Stores metadata about the search index.
// Used to identify whether the bigram index has already been built.
interface SearchMeta {
  key: string;
  value: boolean;
}

export type SearchMode = 'both' | 'startsWith' | 'contains';

@Injectable({
  providedIn: 'root'
})
export class ContactDbService extends Dexie {

  contacts!: Table<Contact, number>;   // IndexedDB table containing the actual contact records.
  searchGrams!: Table<ContactGram, number>; // IndexedDB table containing bigram search-index entries.
  searchMeta!: Table<SearchMeta, string>; // IndexedDB table containing search-index status information.

  private searchIndexBuildPromise?: Promise<void>;

  constructor() {
    super('UnityContactDB');

    // Version 1 already exists in your application.
    // Version 2 adds the bigram search index.
    this.version(2).stores({
      contacts: '++id, name, phone',
      searchGrams: '++id, gram, contactId',
      searchMeta: 'key'
    });
  }

  /**
   * Generates unique two-character combinations (bigrams)
   * from the supplied contact name or search text.
   *
   * Example:
   * Input:  Susmitha
   * Output: su, us, sm, mi, it, th, ha
   *
   * A Set is used to avoid storing duplicate bigrams
   * when the same character combination occurs multiple times.
   *
   * @param value Name or search text from which bigrams are generated.
   * @returns Array of unique two-character combinations.
   */
  private generateBigrams(value: string): string[] {

    // Convert the input into lowercase characters
    // to make searching case-insensitive.
    const chars = Array.from(value.toLowerCase());

     // A bigram requires at least two characters.
    if (chars.length < 2) {
      return [];
    }

    const grams = new Set<string>();

    // Generate consecutive two-character combinations
    for (let i = 0; i < chars.length - 1; i++) {
      grams.add(chars[i] + chars[i + 1]);
    }

    // Convert the Set into an array of unique bigrams.
    return Array.from(grams);
  }

  /**
   * Inserts bigram search-index records into IndexedDB in batches.
   *
   * Instead of inserting all records in one bulkAdd operation,
   * the records are divided into smaller batches of 5,000.
   *
   * This helps control the size of each bulk insertion operation.
   *
   * @param grams Array of bigram records to insert.
   * @returns Promise that resolves after all batches are inserted.
   */
  private async insertGramsInBatches(
    grams: ContactGram[]
  ): Promise<void> {

    const batchSize = 5000;

     // Process the bigram records in batches.
    for (let i = 0; i < grams.length; i += batchSize) {
      const batch = grams.slice(i, i + batchSize);  // Extract the next batch of records.
      await this.searchGrams.bulkAdd(batch); // Insert the current batch into the searchGrams table.
    }
  }

  /**
   * Builds the bigram search index for contacts already stored
   * in IndexedDB.
   *
   * This method is useful when:
   * - Existing contacts are available but the search index is missing.
   * - The application is upgraded to a version that introduces bigram search.
   * - The search-index metadata indicates that indexing is incomplete.
   *
   * Execution steps:
   * 1. Checks whether the search index is already built.
   * 2. Clears any existing incomplete search-index records.
   * 3. Retrieves all existing contacts.
   * 4. Generates unique bigrams for every contact name.
   * 5. Inserts the generated bigrams in batches.
   * 6. Marks the search index as ready.
   *
   * All database operations execute inside one read-write transaction.
   */
  private async rebuildSearchIndex(): Promise<void> {

    await this.transaction(
      'rw',
      this.contacts,
      this.searchGrams,
      this.searchMeta,
      async () => {

        // Check whether another operation has already built the index.
        const metadata = await this.searchMeta.get('bigrams-v1');

        if (metadata?.value) {
          return;
        }

        // Remove any previously generated or incomplete index records.
        await this.searchGrams.clear();

        // Retrieve all existing contacts from IndexedDB.
        const allContacts = await this.contacts.toArray();

        const grams: ContactGram[] = [];

        // Generate bigrams for each contact name.
        for (const contact of allContacts) {

          if (contact.id == null || !contact.name) {
            continue;
          }

          const uniqueGrams = this.generateBigrams(contact.name);

          // Associate each bigram with its original contact ID.
          for (const gram of uniqueGrams) {

            grams.push({
              gram,
              contactId: contact.id
            });
          }
        }

        // Insert all generated bigrams into IndexedDB.
        await this.insertGramsInBatches(grams);

        // Mark the bigram search index as successfully built.
        await this.searchMeta.put({
          key: 'bigrams-v1',
          value: true
        });

        console.log('Search index rebuilt:', grams.length, 'entries');
      }
    );
  }

   /**
   * Checks whether the bigram search index is available.
   *
   * If the index already exists, no rebuilding is required.
   *
   * If the index is missing, rebuildSearchIndex() is executed.
   *
   * The searchIndexBuildPromise ensures that multiple search requests
   * arriving simultaneously share the same index-building operation
   * instead of independently rebuilding the index.
   *
   * @returns Promise that resolves when the search index is ready.
   */
  private async ensureSearchIndex(): Promise<void> {

    // Retrieve the search-index initialization status.
    const metadata = await this.searchMeta.get('bigrams-v1');

    // Return immediately if the index has already been built.
    if (metadata?.value) {
      return;
    }

    // Start index creation only if another operation
    // has not already started building it.
    if (!this.searchIndexBuildPromise) {

      // Reset the promise after completion so that
      // a future request can rebuild the index if necessary.
      this.searchIndexBuildPromise = this.rebuildSearchIndex()
        .finally(() => {
          this.searchIndexBuildPromise = undefined;
        });
    }

    // Wait for the existing or newly initiated index-building operation.
    await this.searchIndexBuildPromise;
  }

   /**
   * Replaces existing contacts with newly downloaded CSV data
   * and rebuilds the bigram search index.
   *
   * Execution steps:
   * 1. Clears the existing contacts and search-index records.
   * 2. Inserts the newly downloaded contacts.
   * 3. Generates bigrams for all new contact names.
   * 4. Inserts bigram entries in batches.
   * 5. Marks the search index as ready.
   *
   * The entire refresh operation runs inside one read-write transaction.
   *
   * Performance metrics are collected separately for:
   * - Clearing old records.
   * - Inserting contacts.
   * - Building the search index.
   *
   * @param data Newly downloaded and parsed contact records.
   * @returns Promise that resolves after contacts and index are refreshed.
   */
  async refreshContacts(data: Contact[]): Promise<void> {

    const totalStart = performance.now();

    await this.transaction(
      'rw',
      this.contacts,
      this.searchGrams,
      this.searchMeta,
      async () => {

        // PHASE 1: Clear old contact records and search-index entries.
        const clearStart = performance.now();

        await this.contacts.clear();
        await this.searchGrams.clear();

        const clearTime = performance.now() - clearStart;

        // PHASE 2: Insert the newly downloaded contact records.
        const insertStart = performance.now();

        let contactIds: number[] = [];

        if (data.length > 0) {
          contactIds = await this.contacts.bulkAdd(
            data,
            { allKeys: true }
          ) as number[];
        }

        const insertTime = performance.now() - insertStart;

        // PHASE 3: Generate the bigram search index for new contacts.
        const indexStart = performance.now();

        const grams: ContactGram[] = [];

        data.forEach((contact, index) => {

          // Retrieve the generated IndexedDB ID for this contact.
          const contactId = contactIds[index];

          if (contactId == null || !contact.name) {
            return;
          }

          // Generate unique bigrams from the contact name.
          const uniqueGrams = this.generateBigrams(contact.name);

          // Create a search-index record for every bigram.
          for (const gram of uniqueGrams) {

            grams.push({
              gram,
              contactId
            });
          }
        });

        await this.insertGramsInBatches(grams);

         // PHASE 4: Mark the search index as ready.
        await this.searchMeta.put({
          key: 'bigrams-v1',
          value: true
        });

        const indexTime = performance.now() - indexStart;

        console.group('IndexedDB Refresh Benchmark');

        console.table({
          'Contacts Inserted': data.length,
          'Bigram Entries': grams.length,
          'Clear Time': `${clearTime.toFixed(2)} ms`,
          'Contact Insert Time': `${insertTime.toFixed(2)} ms`,
          'Index Build Time': `${indexTime.toFixed(2)} ms`
        });

        console.groupEnd();
      }
    );

    console.log(
      'Total IndexedDB Refresh Time:',
      (performance.now() - totalStart).toFixed(2),
      'ms'
    );
  }

  /**
   * Saves contacts using the complete refresh operation.
   *
   * This method is retained for backward compatibility with
   * existing component code that calls saveContacts().
   *
   * It clears existing records, inserts the new contacts,
   * and rebuilds the bigram search index.
   *
   * @param data Array of contacts to save.
   * @returns Promise that resolves after the refresh completes.
   */
  async saveContacts(data: Contact[]): Promise<void> {
    await this.refreshContacts(data);
  }

   /**
   * Retrieves all contact records currently stored in IndexedDB.
   *
   * Used when displaying the complete contact list or
   * verifying that the database refresh was successful.
   *
   * @returns Promise containing all stored contacts.
   */
  async getContacts(): Promise<Contact[]> {
    return await this.contacts.toArray();
  }

  // Delete contacts and their search index
  async clearContacts(): Promise<void> {

    await this.transaction(
      'rw',
      this.contacts,
      this.searchGrams,
      this.searchMeta,
      async () => {

        await this.contacts.clear();
        await this.searchGrams.clear();
        await this.searchMeta.clear();
      }
    );
  }

  /**
   * Searches contacts using the selected search mode.
   *
   * Supported modes:
   *
   * 1. startsWith:
   *    Uses the IndexedDB name index to find names beginning
   *    with the entered search text.
   *
   * 2. contains:
   *    Uses the bigram search index to find names containing
   *    the entered search text.
   *
   * 3. both:
   *    Uses the bigram search index, which supports both
   *    contains and starts-with matching.
   *
   * For one-character searches, the method falls back to
   * scanning the contacts because a single character cannot
   * produce a bigram.
   *
   * The final includes() check verifies the actual substring
   * to eliminate false-positive bigram candidates.
   *
   * @param searchText Text entered by the user.
   * @param mode Search strategy to use. Defaults to 'both'.
   * @returns Promise containing matching contacts.
   */
  async searchContacts(
    searchText: string,
    mode: SearchMode = 'both'
  ): Promise<Contact[]> {

    const search = searchText.trim().toLowerCase();

    if (!search) {
      return [];
    }

    const startTime = performance.now();

    let result: Contact[] = [];

    // Prefix search: use IndexedDB name index
    if (mode === 'startsWith') {

      result = await this.contacts
        .where('name')
        .startsWithIgnoreCase(search)
        .toArray();
    }

    // Contains or both: use bigram index
    else {

      await this.ensureSearchIndex();

      // A single character has no bigram.
      // Fall back to a full scan for this special case.
      if (Array.from(search).length < 2) {

        result = await this.contacts
          .filter(contact =>
            contact.name?.toLowerCase().includes(search)
          )
          .toArray();
      }

      else {

        // Generate bigrams from the user's search text.
        // Example: 'mit' produces 'mi' and 'it'.
        const searchGrams = this.generateBigrams(search);

        // Retrieve the occurrence count of every search bigram.
        // This helps identify the rarest bigram first.
        const gramCounts = await Promise.all(
          searchGrams.map(async gram => ({
            gram,
            count: await this.searchGrams
              .where('gram')
              .equals(gram)
              .count()
          }))
        );

        gramCounts.sort((a, b) => a.count - b.count);

        // No matching bigram means no matching contact
        if (gramCounts.length > 0 && gramCounts[0].count > 0) {

          // Retrieve candidates from the rarest bigram
          const firstMatches = await this.searchGrams
            .where('gram')
            .equals(gramCounts[0].gram)
            .toArray();

          let candidateIds = new Set(
            firstMatches.map(item => item.contactId)
          );

          // Intersect with remaining bigram matches
          for (const item of gramCounts.slice(1)) {

            if (candidateIds.size === 0) {
              break;
            }

            const matches = await this.searchGrams
              .where('gram')
              .equals(item.gram)
              .toArray();

            const matchingIds = new Set(
              matches.map(record => record.contactId)
            );

            candidateIds = new Set(
              [...candidateIds].filter(id => matchingIds.has(id))
            );
          }

          // Retrieve original contacts
          const ids = [...candidateIds].sort((a, b) => a - b);

          const candidates = await this.contacts.bulkGet(ids);

          // Final exact substring verification
          result = candidates.filter(
            (contact): contact is Contact =>
              contact !== undefined &&
              contact.name?.toLowerCase().includes(search)
          );
        }
      }
    }

    const searchTime = performance.now() - startTime;

    console.group('Contact Search Benchmark');

    console.table({
      'Search Text': search,
      'Search Mode': mode,
      'Matching Records': result.length,
      'Search Time': `${searchTime.toFixed(2)} ms`
    });

    console.groupEnd();

    return result;
  }

  /**
   * Replaces existing contact records with newly downloaded contacts
   * without building the bigram search index immediately.
   *
   * This supports the two-phase refresh approach:
   *
   * PHASE 1:
   * 1. Clear old contacts.
   * 2. Clear old bigram records.
   * 3. Clear search-index metadata.
   * 4. Insert new contacts.
   *
   * PHASE 2:
   * The component calls prepareSearchIndex() separately
   * to build the bigram search index.
   *
   * This allows the application to display newly saved contacts
   * before the search-index preparation is completed.
   *
   * @param data Newly downloaded contact records.
   * @returns Promise that resolves after contacts are saved.
   */
  async replaceContacts(data: Contact[]): Promise<void> {

    const startTime = performance.now();

    await this.transaction(
      'rw',
      this.contacts,
      this.searchGrams,
      this.searchMeta,
      async () => {

        await this.contacts.clear();
        await this.searchGrams.clear();
        await this.searchMeta.clear();

        await this.contacts.bulkAdd(data);
      }
    );

    console.log(
      'Contacts saved:',
      data.length,
      'Time:',
      (performance.now() - startTime).toFixed(2),
      'ms'
    );
  }

  /**
   * Prepares the bigram search index after the contact records
   * have been refreshed.
   *
   * Calls ensureSearchIndex(), which:
   * 1. Checks whether the index is already available.
   * 2. Builds the index if it is missing.
   * 3. Reuses an ongoing index-building operation if one exists.
   *
   * This method is used in PHASE 2 of the CSV refresh process.
   *
   * @returns Promise that resolves when the search index is ready.
   */
  async prepareSearchIndex(): Promise<void> {

    const startTime = performance.now();

    await this.ensureSearchIndex();

    console.log(
      'Search index ready. Time:',
      (performance.now() - startTime).toFixed(2),
      'ms'
    );
  }
}
