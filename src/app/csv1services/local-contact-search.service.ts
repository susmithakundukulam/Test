import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import Dexie, { Table } from 'dexie';
import { firstValueFrom } from 'rxjs';

import { Contact, ContactMetadata } from './contact-search.model';

@Injectable({
    providedIn: 'root'
})
export class LocalContactSearchService extends Dexie {

    // Store actual contacts.
    contacts!: Table<Contact, number>;

    // Store CSV refresh information.
    metadata!: Table<ContactMetadata, string>;

    // Refresh CSV every 3 days.
    private readonly refreshInterval =
        3 * 24 * 60 * 60 * 1000;

    // Keep contacts in memory for repeated searches.
    private cachedContacts: Contact[] = [];

    constructor(private http: HttpClient) {

        // Use a completely separate IndexedDB database.
        super('UnityContactSearchDB');

        // Define the new database structure.
        this.version(1).stores({
            contacts: '++id, name, phone',
            metadata: 'key'
        });
    }

    // Initialize contacts when the application starts.
    // Load existing data and refresh CSV if required.
    // async initializeContacts(): Promise<Contact[]> {

    //     // Read existing contacts from IndexedDB.
    //     let storedContacts = await this.contacts.toArray();

    //     // Find the last successful CSV refresh time.
    //     const lastRefresh = await this.metadata.get('lastCsvRefresh');

    //     // Determine whether a CSV download is required.
    //     const shouldRefresh =
    //         storedContacts.length === 0 ||
    //         !lastRefresh ||
    //         Date.now() - lastRefresh.value >= this.refreshInterval;

    //     if (shouldRefresh) {

    //         try {

    //             // Download and save the latest CSV.
    //             await this.downloadAndSaveCsv();

    //             // Read the updated contacts.
    //             storedContacts = await this.contacts.toArray();

    //         } catch (error) {

    //             // If the download fails, continue using existing data.
    //             console.error('CSV refresh failed:', error);

    //             // If no existing contacts are available, propagate the error.
    //             if (storedContacts.length === 0) {
    //                 throw error;
    //             }
    //         }
    //     }

    //     // Keep contacts in memory for fast searching.
    //     this.cachedContacts = storedContacts;

    //     return this.cachedContacts;
    // }

    // Download the CSV, parse it, and replace the contacts in IndexedDB.
    // Benchmark each stage so we can identify performance bottlenecks.
    private async downloadAndSaveCsv(csvUrl: string): Promise<void> {

        // Record the starting time of the complete refresh operation.
        const totalStartTime = performance.now();

        // Record the time immediately before starting the HTTP request.
        const downloadStartTime = performance.now();

        console.log('==========================================');
        console.log('CSV DOWNLOAD STARTED');
        console.log('Started at:', new Date().toLocaleString());
        console.log('==========================================');

        try {

            const freshUrl = `${csvUrl}${csvUrl.includes('?') ? '&' : '?'}_=${Date.now()}`;

            // Download CSV as text and retain the HTTP response headers.
            const response = await firstValueFrom(
            this.http.get(freshUrl, {
                responseType: 'text',
                observe: 'response'
            })
            );

            // Calculate how long the HTTP request took.
            const downloadTime = performance.now() - downloadStartTime;

            // Get the downloaded CSV text.
            const csv = response.body ?? '';

            // Calculate the size of the downloaded, decompressed CSV text.
            const fileSizeBytes = new Blob([csv]).size;

            const fileSizeKB = fileSizeBytes / 1024;
            const fileSizeMB = fileSizeBytes / (1024 * 1024);

            // Content-Length may not be available to JavaScript.
            // If exposed by the server, log its reported value separately.
            const contentLength = response.headers.get('Content-Length');

            console.log('CSV DOWNLOAD COMPLETED');

            // console.table({
            //     'Download Time': `${downloadTime.toFixed(2)} ms`,
            //     'CSV Size (Bytes)': fileSizeBytes,
            //     'CSV Size (KB)': `${fileSizeKB.toFixed(2)} KB`,
            //     'CSV Size (MB)': `${fileSizeMB.toFixed(3)} MB`,
            //     'Content-Length Header': contentLength ?? 'Not available'
            // });

            // -------------------------------
            // CSV PARSING BENCHMARK
            // -------------------------------

            const parseStartTime = performance.now();

            // Convert CSV text into contact objects.
            const newContacts = this.parseCsv(csv);

            const parseTime = performance.now() - parseStartTime;

            console.log('CSV PARSING COMPLETED');

            // console.table({
            //     'Parsing Time': `${parseTime.toFixed(2)} ms`,
            //     'Records Parsed': newContacts.length
            // });

            // Do not replace existing contacts with an empty CSV.
            if (newContacts.length === 0) {
                throw new Error('CSV contains no contact records.');
            }

            // -------------------------------
            // INDEXEDDB SAVE BENCHMARK
            // -------------------------------

            const databaseStartTime = performance.now();

            // Replace existing contacts and save refresh metadata atomically.
            await this.transaction(
                'rw',
                this.contacts,
                this.metadata,
                async () => {

                    // Remove old contacts.
                    await this.contacts.clear();

                    // Insert new contacts.
                    await this.contacts.bulkAdd(newContacts);

                    // Save the successful refresh timestamp.
                    await this.metadata.put({
                        key: 'lastCsvRefresh',
                        value: Date.now()
                    });
                }
            );

            const databaseTime = performance.now() - databaseStartTime;

            console.log('INDEXEDDB SAVE COMPLETED');

            // console.table({
            //     'Database Save Time': `${databaseTime.toFixed(2)} ms`,
            //     'Contacts Saved': newContacts.length
            // });

            // -------------------------------
            // TOTAL REFRESH BENCHMARK
            // -------------------------------

            const totalTime = performance.now() - totalStartTime;

            console.log('CSV TOTAL TIME');

            console.table({
                'Download Time': `${downloadTime.toFixed(2)} ms`,
                'Parsing Time': `${parseTime.toFixed(2)} ms`,
                'Database Save Time': `${databaseTime.toFixed(2)} ms`,
                'Total Refresh Time': `${totalTime.toFixed(2)} ms`,
                'Total Contacts': newContacts.length,
                'CSV Size': `${fileSizeKB.toFixed(2)} KB`
            });

            console.log('==========================================');

        } catch (error) {

            // Log any download, parsing, or database error.
            console.error('CSV DOWNLOAD / REFRESH FAILED:', error);

            // Propagate the error to the component.
            throw error;
        }
    }

    // Parse CSV text into Contact objects.
    // This parser expects the columns: name, phone.
    private parseCsv(csv: string): Contact[] {

        const lines = csv.replace(/^\uFEFF/, '').split(/\r?\n/);

        // Read column names from the header.
        const headers = lines[0]
            .split(',')
            .map(value => value.trim().toLowerCase());

        const nameIndex = headers.indexOf('name');
        const phoneIndex = headers.indexOf('phone');

        if (nameIndex === -1 || phoneIndex === -1) {
            throw new Error('CSV must contain name and phone columns.');
        }

        // Convert each CSV row into a contact.
        return lines.slice(1)
            .filter(line => line.trim().length > 0)
            .map(line => {

                const values = line.split(',');

                return {
                    name: values[nameIndex]?.trim() ?? '',
                    phone: values[phoneIndex]?.trim() ?? ''
                };
            })
            .filter(contact => contact.name || contact.phone);
    }

    // Search both contact names and phone numbers in memory.
    // Measure how long each search takes.
    searchContacts(searchText: string): Contact[] {

        // Start measuring before processing the search.
        const searchStartTime = performance.now();

        // Record the time at which the search was requested.
        const searchStartedAt = new Date().toLocaleTimeString();

        // Normalize the search text.
        const query = searchText.trim().toLowerCase();

        // Empty search should return no results.
        if (!query) {
            return [];
        }

        // Remove spaces and symbols from phone search text.
        const phoneQuery = query.replace(/\D/g, '');

        // Determine whether the input is suitable for phone searching.
        const isPhoneQuery =
            phoneQuery.length > 0 &&
            /^[+\d\s().-]+$/.test(searchText.trim());

        // Check every contact in the in-memory array.
        const results = this.cachedContacts.filter(contact => {

            // Check whether the name contains the search text.
            const nameMatches =
                contact.name.toLowerCase().includes(query);

            // Normalize the stored phone number.
            const normalizedPhone =
                contact.phone.replace(/\D/g, '');

            // Check whether the phone contains the entered digits.
            const phoneMatches =
                isPhoneQuery &&
                normalizedPhone.includes(phoneQuery);

            // Match if either the name or phone number matches.
            return nameMatches || phoneMatches;
        });

        // Calculate total search execution time.
        const searchTime = performance.now() - searchStartTime;

        // Log the search benchmark.
        console.groupCollapsed(
            `CONTACT SEARCH: "${searchText}" | ${searchTime.toFixed(2)} ms`
        );

        console.table({
            'Search Text': searchText,
            'Search Started At': searchStartedAt,
            'Search Type': isPhoneQuery ? 'Name + Phone' : 'Name',
            'Total Contacts Checked': this.cachedContacts.length,
            'Matching Contacts': results.length,
            'Search Execution Time': `${searchTime.toFixed(2)} ms`
        });

        console.groupEnd();

        return results;
    }

    // Return the number of contacts currently loaded in memory.
    getContactCount(): number {
        return this.cachedContacts.length;
    }

    // Download the latest CSV and save it to IndexedDB.
    async downloadAndRefreshContacts(csvUrl: string): Promise<void> {
        await this.downloadAndSaveCsv(csvUrl);
    }

    // Load contacts from IndexedDB into memory.
    async loadContactsIntoMemory(): Promise<Contact[]> {

    console.log('Dexie database name:', this.name);

    this.checkIndexedDBAvailability();

    this.cachedContacts = await this.contacts.toArray();

    console.log(
        'Contacts loaded into memory:',
        this.cachedContacts.length
    );

    return this.cachedContacts;
}

private checkIndexedDBAvailability(): void {

    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is not available in this environment.');
    }
}
}