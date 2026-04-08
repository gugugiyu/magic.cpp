This project is a fork from the llama.cpp webui with additional feature based on the original one.

## Why
I really like the sleek, clean, and minimal style of llama.cpp, but it just seems quite falling behind against the other webui projects. So I decided to fork it and add some features that I think are missing.

## What was implemented so far
- Everforest theme
- Personalization feature
- Mermaid diagram support
- Built in tools like time & location & memory
- Dedicated subagent flow
- Filter (no emoji, codeblock only, raw content, ...)
- Preset library
- 4 Layer context condenser
- TL;DR summary per message

> Expanded features can be found at [here](./docs/frontend)

## WIP
- Now building the backend. Unfortunately to use this against external endpoints, we need CORS resolve, hence a dedicated backend is needed.
- Frontend is still in progress.
