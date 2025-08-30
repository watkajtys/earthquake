/**
 * @file functions/background/jules-task.js
 * @description A new scheduled task called julesTask.
 */

import { createScheduledTaskLogger } from '../../src/utils/scheduledTaskLogger';

export default {
  async scheduled(controller, env, ctx) {
    const logger = createScheduledTaskLogger('julesTask', controller.scheduledTime);
    logger.logMilestone('julesTask started');

    // Add your task logic here

    logger.logMilestone('julesTask finished');
    logger.logTaskCompletion(true);
  },
};
