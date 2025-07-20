import React from 'react';

/**
 * @file JulesTask.jsx
 * @description This component is a placeholder for a new task node.
 * @author Jules
 */

/**
 * A component that represents a task node.
 *
 * @component
 * @param {object} props - The properties for the component.
 * @param {string} props.taskName - The name of the task.
 * @param {string} props.taskStatus - The status of the task.
 * @returns {React.ReactElement} A React element representing the task node.
 */
const JulesTask = ({ taskName, taskStatus }) => {
  return (
    <div className="jules-task-node">
      <p>Task Name: {taskName}</p>
      <p>Status: {taskStatus}</p>
    </div>
  );
};

export default JulesTask;
