---
title: Q/A System Guide
description: Helps users find the right settings location for their needs
context: fork
userInvocable: false
---

# Settings Q/A System Guide

This guide helps the LLM assist users in finding the correct settings location for their specific needs or questions.

## General Settings

**Q: How do I set a custom system message that defines model behavior?**  
A: Go to **ChatSettings → General → System Message**.

**Q: How do I control the file length threshold for pasting long text?**  
A: Go to **ChatSettings → General → Paste Long Text To File Len**. Set to 0 to disable.

**Q: How do I copy text attachments as plain text instead of special format?**  
A: Go to **ChatSettings → General → Copy Text Attachments As Plain Text**.

**Q: How do I parse PDFs as images instead of text?**  
A: Go to **ChatSettings → General → PDF As Image**.

**Q: How do I enable the Continue button for assistant messages?**  
A: Go to **ChatSettings → General → Enable Continue Generation**.

**Q: How do I automatically confirm before changing conversation title when editing first message?**  
A: Go to **ChatSettings → General → Ask For Title Confirmation**.

**Q: How do I use only the first line of my prompt to generate conversation title?**  
A: Go to **ChatSettings → General → Title Generation Use First Line**.

---

## Display Settings

**Q: How do I change the color theme (light/dark/system)?**  
A: Go to **ChatSettings → Display → Theme**. Choose System (follows device), Light, Dark, Tokyo Night, or Everforest.

**Q: How do I make the sidebar always visible on desktop?**  
A: Go to **ChatSettings → Display → Always Show Sidebar On Desktop** and enable it.

**Q: How do I auto-show the sidebar when starting a new chat?**  
A: Go to **ChatSettings → Display → Auto Show Sidebar On New Chat**.

**Q: How do I keep stats visible after generation finishes?**  
A: Go to **ChatSettings → Display → Keep Stats Visible**.

**Q: How do I show message generation statistics (tokens/sec, duration)?**  
A: Go to **ChatSettings → Display → Show Message Stats**.

**Q: How do I show/hide the system message at the top of conversations?**  
A: Go to **ChatSettings → Display → Show System Message**.

**Q: How do I see full raw model names instead of parsed names?**  
A: Go to **ChatSettings → Display → Show Raw Model Names**.

**Q: How do I expand thought process by default when generating?**  
A: Go to **ChatSettings → Display → Show Thought In Progress**.

**Q: How do I always show code blocks at full height instead of collapsed?**  
A: Go to **ChatSettings → Display → Full Height Code Blocks**.

**Q: How do I render my own messages using markdown formatting?**  
A: Go to **ChatSettings → Display → Render User Content As Markdown**.

**Q: How do I control automatic scrolling during message streaming?**  
A: Go to **ChatSettings → Display → Disable Auto Scroll**.

**Q: How do I control microphone button visibility for audio-capable models?**  
A: Go to **ChatSettings → Display → Auto Mic On Empty**.

---

## Sampling Parameters

**Q: How do I configure sampling order and parameters?**  
A: Go to **ChatSettings → Sampling** and configure the desired samplers.

**Q: How do I control randomness/creativity of generated text?**  
A: Go to **ChatSettings → Sampling → Temperature**. Higher values = more random output.

**Q: How do I limit tokens to those with cumulative probability at least P?**  
A: Go to **ChatSettings → Sampling → Top P (Nucleus Sampling)**.

**Q: How do I keep only K top tokens?**  
A: Go to **ChatSettings → Sampling → Top K**.

**Q: How do I limit tokens based on minimum probability relative to most likely token?**  
A: Go to **ChatSettings → Sampling → Min P**.

**Q: How do I control the maximum number of tokens per output?**  
A: Go to **ChatSettings → Sampling → Max Tokens**. Use -1 for infinite (no limit).

**Q: How do I enable backend-based sampling for faster performance?**  
A: Go to **ChatSettings → Sampling → Backend Sampling**.

**Q: How do I configure sampling order?**  
A: Go to **ChatSettings → Sampling → Samplers**. Default is "top_k;typ_p;top_p;min_p;temperature".

---

## Penalties

**Q: How do I control repetition of token sequences in generated text?**  
A: Go to **ChatSettings → Penalties** and configure **Repeat Penalty** and **Repeat Last N**.

**Q: How do I limit tokens based on whether they appear in the output?**  
A: Go to **ChatSettings → Penalties → Presence Penalty**.

**Q: How do I limit tokens based on how often they appear in the output?**  
A: Go to **ChatSettings → Penalties → Frequency Penalty**.

**Q: How do I configure DRY sampling to reduce repetition across long contexts?**  
A: Go to **ChatSettings → Penalties** and configure **DRY Multiplier**, **DRY Base**, **DRY Allowed Length**, and **DRY Penalty Last N**.

**Q: How do I control the chance of cutting tokens in XTC sampler?**  
A: Go to **ChatSettings → Penalties → XTC Probability**. Set to 0 to disable XTC.

**Q: How do I control the token probability threshold for cutting in XTC sampler?**  
A: Go to **ChatSettings → Penalties → XTC Threshold**.

**Q: How do I sort and limit tokens based on log-probability and entropy difference?**  
A: Go to **ChatSettings → Penalties → Typ P**.

**Q: How do I configure dynamic temperature settings?**  
A: Go to **ChatSettings → Penalties** and configure **Dynatemp Range** and **Dynatemp Exponent**.

---

## MCP Servers

**Q: How do I configure MCP servers?**  
A: Go to **ChatSettings → MCP** and edit the `mcpServers` configuration as a JSON list.

**Q: How do I view usage statistics for MCP servers?**  
A: Go to **ChatSettings → MCP** and view `mcpServerUsageStats`.

---

## Tools (Agentic Behavior & Built-in Tools)

### Agentic Behavior

**Q: How do I prevent infinite tool execution loops?**  
A: Go to **ChatSettings → Tools → Maximum Agentic Turns** to set the max number of tool cycles before stopping.

**Q: How do I control how many lines shown in tool output previews?**  
A: Go to **ChatSettings → Tools → Agentic Max Tool Preview Lines**.

**Q: How do I auto-expand tool call details during execution?**  
A: Go to **ChatSettings → Tools → Show Tool Call In Progress**.

**Q: How do I always show agentic turn details instead of collapsing them?**  
A: Go to **ChatSettings → Tools → Always Show Agentic Turns**.

**Q: How do I limit the number of tool calls per turn?**  
A: Go to **ChatSettings → Tools → Agentic Max Tool Calls Per Turn**. Excess calls are dropped with a warning appended to context. Prevents runaway parallel tool storms.

### Tool Output Summarization

**Q: How do I enable summarization for long tool outputs?**  
A: Go to **ChatSettings → Tools → MCP Summarize Outputs**.

**Q: How do I set the line count threshold for triggering tool output summarization?**  
A: Go to **ChatSettings → Tools → MCP Summarize Line Threshold**.

**Q: How do I set a hard line cap for tool outputs?**  
A: Go to **ChatSettings → Tools → MCP Summarize Hard Cap**. Set to -1 to disable.

**Q: How do I apply summarization threshold to built-in tools as well?**  
A: Go to **ChatSettings → Tools → MCP Summarize All Tools**.

**Q: How do I set an auto-timeout for the summarize dialog?**  
A: Go to **ChatSettings → Tools → MCP Summarize Auto Timeout**. Enter seconds before the dialog auto-selects "Keep raw output". Set to 0 to disable.

### Built-in Tools

**Q: How do I enable the calculator tool?**  
A: Go to **ChatSettings → Tools → Calculator**.

**Q: How do I enable the time/date retrieval tool?**  
A: Go to **ChatSettings → Tools → Time**.

**Q: How do I enable the location retrieval tool?**  
A: Go to **ChatSettings → Tools → Location**.

**Q: How do I enable the subagent delegation tool?**  
A: Go to **ChatSettings → Tools → Call Subagent**.

**Q: How do I enable skill tools for custom capabilities?**  
A: Go to **ChatSettings → Tools → Skills**.

**Q: How do I enable read-only filesystem tools (read_file, list_directory, search_files)?**  
A: Go to **ChatSettings → Tools → Safe File Tools**.

**Q: How do I enable write-capable filesystem tools (write_file, patch_file, delete_file, move_file)?**  
A: Go to **ChatSettings → Tools → Mutating File Tools**. Use with caution.

**Q: How do I enable the run_command tool for executing shell commands?**  
A: Go to **ChatSettings → Tools → Run Command**. Each command requires per-session user approval.

**Q: How do I enable todo list tools (create_todo, mark_todo)?**  
A: Go to **ChatSettings → Tools → Todo List**.

---

## Output Filters

**Q: How do I remove all emoji from model responses?**  
A: Go to **ChatSettings → Filters → Emoji Removal**.

**Q: How do I keep only the first code block and discard surrounding text?**  
A: Go to **ChatSettings → Filters → Codeblock Only**.

**Q: How do I strip all markdown formatting and show plain text?**  
A: Go to **ChatSettings → Filters → Raw Mode**.

**Q: How do I auto-detect language tags and instruct model to respond in that language?**  
A: Go to **ChatSettings → Filters → Language Pinner**.

**Q: How do I enable markdown normalization and correction?**  
A: Go to **ChatSettings → Filters → Normalize Markdown** (recommended).

---

## Developer Settings

**Q: How do I show a toggle to view messages as plain text instead of formatted markdown?**  
A: Go to **ChatSettings → Developer → Show Raw Output Switch**.

**Q: How do I prevent server-side extraction of reasoning tokens?**  
A: Go to **ChatSettings → Developer → Disable Reasoning Parsing**. This sends `reasoning_format=none`.

**Q: How do I strip reasoning content from previous messages before sending to the model?**  
A: Go to **ChatSettings → Developer → Exclude Reasoning From Context**.

**Q: How do I set custom JSON parameters to send to the API?**  
A: Go to **ChatSettings → Developer → Custom** and enter valid JSON.

---

## Experimental Features

**Q: How do I enable Python interpreter using Pyodide?**  
A: Go to **ChatSettings → Developer → Python Interpreter**. Allows running Python code in markdown code blocks.

---

## Quick Reference: Settings Locations

- **General**: System message, title settings, text handling, PDF mode, continue generation
- **Display**: Theme, sidebar, stats, code blocks, markdown rendering, scroll behavior, mic button, model names, system message visibility
- **Sampling**: Samplers order, temperature, top_p, top_k, min_p, max tokens, backend sampling
- **Penalties**: Repeat penalty, repeat last n, presence/frequency penalties, DRY sampling, XTC sampler, Typ P, dynamic temperature
- **MCP**: MCP server configuration and usage stats
- **Tools**: Agentic max turns, tool call limits, tool previews, MCP summarization, all built-in tools (calculator, time, location, subagent, skills, file tools, run command, todo list)
- **Filters**: Emoji removal, codeblock only, raw mode, language pinner, markdown normalization
- **Developer**: Raw output switch, reasoning parsing, custom JSON parameters, Python interpreter

When a user asks about a specific capability or problem, identify which category it belongs to and guide them to the appropriate settings location.
