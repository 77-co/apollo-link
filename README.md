# apollo-spotify-auth
An Express app for handling Apollo assistant's Spotify integration on the back end.

# Documentation
## Endpoints
### GET `/auth/:state`
This endpoint requires a state parameter in the path. It redirects to a Spotify authentication page and should be used to create a QR code as this route's full URL is much shorter than the original Spotify auth URL.

This route also detects when someone entered it and forwards the information to an SSE stream so Apollo knows someone is currently logging in.

### GET `/sse/:state`
This endpoint is designed for use by the Apollo IoT interface. It returns an event stream that writes one or more of the following events to the stream:
- ``data: { "status": "keep-alive" }`` - Sent every 10 seconds
- ``data: { "status": "URL visited" }`` - Sent when someone visits the login URL (see: [`/auth/:state`](#get-authstate))
- ``data: { "status": "User logged in", access_token, refresh_token, expires_in }`` - Server ends a request after sending this one.

### GET `/start-auth`
This route returns a single use URL for the user to authenticate with as well as the state identifier for tracking user's login process status.
```json
{ "state": "<state>", "url": "<protocol>://<host>/auth/<state>" }
```

### GET `/callback`
This endpoint is reserved for Spotify to call back to after authenticating a user. It triggers an event in [`/sse/:state`](#get-ssestate).