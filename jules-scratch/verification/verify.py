from playwright.sync_api import sync_playwright, TimeoutError

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    try:
        page.goto("http://localhost:5173/")
        # Wait for a stable part of the UI to ensure the app has loaded past the initial spinner.
        # "Live Statistics" seems like a good candidate.
        print("Waiting for 'Live Statistics' to appear...")
        page.wait_for_selector("text=Live Statistics", timeout=60000)
        print("'Live Statistics' found.")

        # Now, specifically check for our new component.
        print("Waiting for 'Most Significant Quake This Week' to appear...")
        page.wait_for_selector("text=Most Significant Quake This Week", timeout=10000)
        print("'Most Significant Quake This Week' found.")

    except TimeoutError as e:
        print(f"Playwright script failed with timeout: {e}")
        # Even if it fails, we want to see what the page looks like.
    finally:
        print("Taking screenshot...")
        page.screenshot(path="jules-scratch/verification/verification.png")
        browser.close()
        print("Browser closed.")

with sync_playwright() as playwright:
    run(playwright)
