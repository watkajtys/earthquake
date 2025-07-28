# Tools

This file describes the tools available to the agent.

## Standard Tools

- `ls(directory_path: str = "") -> list[str]`: lists all files and directories under the given directory (defaults to repo root).
- `read_files(filepaths: list[str]) -> list[str]`: returns the content of the specified files in the repo.
- `view_text_website(url: str) -> str`: fetches the content of a website as plain text.
- `set_plan(plan: str) -> None`: sets or updates the plan for how to solve the issue.
- `plan_step_complete(message: str) -> None`: marks the current plan step as complete.
- `message_user(message: str, continue_working: bool) -> None`: messages the user.
- `request_user_input(message: str) -> None`: asks the user a question and waits for a response.
- `record_user_approval_for_plan() -> None`: records the user's approval for the plan.
- `submit(branch_name: str, commit_message: str, title: str, description: str) -> None`: Commits the current code and requests user approval to push.
- `delete_file(filepath: str) -> str`: deletes a file.
- `rename_file(filepath: str, new_filepath: str) -> str`: renames and/or moves files and directories.
- `grep(pattern: str) -> str`: runs grep for the given pattern.
- `reset_all() -> None`: Resets the entire codebase to its original state.
- `restore_file(filepath: str) -> None`: Restores the given file to its original state.
- `view_image(url: str) -> Image`: Loads the image at the provided URL.

## Special Tools

- `run_in_bash_session`: Runs the given bash command in the sandbox.
- `create_file_with_block`: Use this to create a new file.
- `overwrite_file_with_block`: Use this tool to completely replace the entire content of an existing file.
- `replace_with_git_merge_diff`: Use this to perform a targeted search-and-replace to modify part of an existing file.
