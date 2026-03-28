import time
import sys

print("Hello! I am a normal Python script running on a remote server.")
time.sleep(1)

print("Let's do some magic. I will now command the Ter workstation to open GitHub in the side panel.")
time.sleep(2)

# This is the magic string. The Ter frontend interceptor is listening for exactly this format.
print('[TER_RPC] {"action": "navigate", "url": "https://github.com"}')

# Force flush the stdout to ensure the PTY sends it immediately
sys.stdout.flush()

time.sleep(1)
print("Done! Check your CyberHUD Webview panel.")