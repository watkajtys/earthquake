/**
 * @fileoverview This file contains the julesTask node, which is a simple task that logs a message to the console.
 */

/**
 * A simple task that logs a message to the console.
 *
 * @param {object} context - The context object.
 * @param {object} context.env - The environment object.
 * @param {object} context.logger - The logger object.
 * @returns {Promise<Response>} A promise that resolves with a response.
 */
export async function onRequestGet({ env, logger }) {
  if (logger) {
    logger.log('Jules task executed!');
  } else {
    console.log('Jules task executed!');
  }
  return new Response('Jules task executed!');
}
