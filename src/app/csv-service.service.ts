import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { defer, map, Observable } from 'rxjs';
import { Contact } from './contact-db.service';

@Injectable({
  providedIn: 'root'
})
export class CsvServiceService {

  // Inject Angular HttpClient to make HTTP requests
  // for downloading CSV files from the configured URL.
  constructor(private http: HttpClient) { }

    /**
   * Downloads a CSV file from the provided URL and converts
   * its contents into an array of Contact objects.
   *
   * Also measures the following performance metrics:
   * 1. CSV download time.
   * 2. CSV parsing time.
   * 3. Total time taken for download and parsing.
   * 4. Uncompressed CSV file size.
   * 5. Total number of records parsed.
   *
   * Uses defer() to start the performance timer when the
   * Observable is subscribed to, rather than when it is created.
   *
   * @param url URL from which the CSV file should be downloaded.
   * @returns Observable containing the parsed Contact array.
   */
  readCsvFromUrl(url: string): Observable<Contact[]> {

    return defer(() => {

      // Capture the start time immediately before initiating the HTTP request.
      const startTime = performance.now();

      console.log('CSV download started');

      // Download the CSV file as plain text.
      // Angular HttpClient handles HTTP response decompression automatically.
      return this.http.get(url, {
        responseType: 'text'
      }).pipe(

         // Process the downloaded CSV response.
        map(csv => {

          // Calculate the time taken to receive the complete HTTP response body.
          const downloadTime = performance.now() - startTime;

          // Start measuring CSV parsing time separately.
          const parseStart = performance.now();

          // Convert CSV text into an array of Contact objects.
          const result = this.parseCsv(csv);

          // Calculate the time taken to parse the CSV data.
          const parseTime = performance.now() - parseStart;

          // Calculate the uncompressed CSV response size in bytes.
          const fileSize = new Blob([csv]).size;

          console.group('CSV Download Benchmark');

          console.table({
            'Uncompressed File Size':
              `${(fileSize / 1024).toFixed(2)} KB`,
            'Download Time':
              `${downloadTime.toFixed(2)} ms`,
            'Parsing Time':
              `${parseTime.toFixed(2)} ms`,
            'Total Time':
              `${(performance.now() - startTime).toFixed(2)} ms`,
            'Records Parsed': result.length
          });

          console.groupEnd();

          return result;
        })
      );
    });
  }

  /**
   * Converts the downloaded CSV text into Contact objects.
   *
   * Processing steps:
   * 1. Split the CSV content into individual lines.
   * 2. Skip the first line because it contains column headers.
   * 3. Remove empty lines.
   * 4. Split each remaining line into column values.
   * 5. Map the first column to name and the second column to phone.
   *
   * @param csv Raw CSV content received from the HTTP response.
   * @returns Array of Contact objects.
   */
  private parseCsv(csv: string): Contact[] {

    const lines = csv.split(/\r?\n/);

    return lines.slice(1)
      .filter(line => line.trim() !== '')
      .map(line => {

        const values = line.split(',');

        return {
          name: values[0]?.trim() ?? '',
          phone: values[1]?.trim() ?? ''
        };
      });
  }
}
