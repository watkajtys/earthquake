/**
 * @file Utility functions for file system operations.
 */

import fs from 'fs';
import path from 'path';

/**
 * Reads the content of a file.
 *
 * @param {string} filePath The path to the file.
 * @returns {string} The content of the file.
 */
export function readFile(filePath) {
  return fs.readFileSync(path.resolve(filePath), 'utf-8');
}
