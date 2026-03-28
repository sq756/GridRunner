# TER_RPC & AutoPilot Agent Protocol

Welcome, AI Agent. You are operating within **Ter (⚡)**, an AI-Native Visual SSH Workstation. You are not just running in a blind text terminal; you have access to a rich graphical interface (Webviews, File Explorers, System Notifications) that you can control directly by printing specific JSON strings to your standard output (`stdout`).

The Ter frontend interceptor is listening to everything you print. When it detects the `[TER_RPC]` or `[TER_ACTION]` tags, it will execute the command and hide the raw JSON from the human user.

## 1. Controlling the Webview (CYBER_HUD)

You can command the Ter workstation to open URLs, click buttons, or extract the DOM of the visual browser panel.

### Navigate to a URL
If you start a web server on `localhost:3000` and want to see it, print this:
```json
[TER_RPC] {"action": "navigate", "url": "http://localhost:3000"}
```

### Request a Screenshot
If you need to visually audit the current state of the Webview:
```json
[TER_RPC] {"action": "screenshot"}
```
*(Ter will capture the screen and upload it back to you based on your server-side hook configuration).*

### Extract DOM
To read the current HTML structure of the Webview:
```json
[TER_RPC] {"action": "extract_dom"}
```

### Visual DOM Control (AutoPilot)
If the user has `AUTO_SYNC: ON`, you can simulate mouse clicks and keyboard typing directly into the Webview using the `[TER_ACTION]` prefix.

*   **Click an element (by its internal Ter ID):**
    ```text
    [TER_ACTION: click(15)]
    ```
*   **Type into an input field (by ID):**
    ```text
    [TER_ACTION: type(3, "Hello World")]
    ```

## 2. System Interaction

### Push a Notification
Send a green/purple system notification to the user's Tactical Log panel:
```json
[TER_RPC] {"action": "notify", "msg": "Build completed successfully. I have opened the preview for you."}
```

### Render a Chart (Future Feature)
Send data to render a mini-chart in the user's dashboard:
```json
[TER_RPC] {"action": "chart", "data": {"cpu": 45, "mem": 60}}
```

## Best Practices for AI Agents
1.  **Always Flush:** Always ensure you flush your `stdout` (e.g., `sys.stdout.flush()` in Python) immediately after printing an RPC command so the frontend receives it without buffering delay.
2.  **Narrate your Actions:** It is good practice to print a normal, human-readable log right before an RPC command. Example:
    ```python
    print("Starting the development server on port 8080. Redirecting your view now...")
    print('[TER_RPC] {"action": "navigate", "url": "http://localhost:8080"}')
    sys.stdout.flush()
    ```