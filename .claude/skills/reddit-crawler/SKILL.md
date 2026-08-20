---
name: reddit-crawler
description: Use when you need to search Reddit for posts and comments without an API key, fetch post bodies and comment threads, or monitor Reddit for keyword mentions in the last 24-48 hours. Covers the public JSON endpoint trick, URL patterns, response structure, pagination, and how to extract post body plus top comments.
---

# Reddit Crawler (No API Key Required)

## Overview

Reddit exposes every page as JSON by appending `.json` to any URL. No API key, no OAuth, no rate-limit registration. You can search posts, browse subreddits, and fetch full comment threads using only the WebFetch tool.

---

## URL Patterns

### Search all of Reddit

```
https://www.reddit.com/search.json?q=QUERY&sort=new&t=day&limit=25
```

| Parameter | Values | Notes |
|---|---|---|
| `q` | URL-encoded search string | Use `+` for spaces: `CAM+reconciliation` |
| `sort` | `new`, `hot`, `relevance`, `top` | Use `new` for recency monitoring |
| `t` | `hour`, `day`, `week`, `month`, `year`, `all` | `day` = last 24h |
| `limit` | 1-100 | 25 is safe; 100 is max |
| `after` | token from previous response | For pagination |

### Search within one subreddit

```
https://www.reddit.com/r/SUBREDDIT/search.json?q=QUERY&sort=new&t=day&restrict_sr=1&limit=25
```

Add `restrict_sr=1` to stay in the subreddit. Without it, returns site-wide results.

### Browse new posts in a subreddit (no query)

```
https://www.reddit.com/r/smallbusiness/new.json?limit=25
```

Useful for subreddits where you want everything new, not keyword-filtered.

### Fetch a single post with its comments

```
https://www.reddit.com/r/SUBREDDIT/comments/POST_ID.json?limit=50&depth=3
```

Or use the post's permalink directly:

```
https://www.reddit.com/PERMALINK.json
```

Example: if `permalink` is `/r/smallbusiness/comments/abc123/my_lease_question/`, fetch:

```
https://www.reddit.com/r/smallbusiness/comments/abc123.json?limit=50&depth=3
```

---

## How to Fetch

**WebFetch cannot fetch reddit.com — it is blocked.** Use the Playwright `browser_navigate` tool instead.

```
# Step 1: Navigate with Playwright
browser_navigate("https://www.reddit.com/r/smallbusiness/comments/abc123.json?limit=100&depth=5")
```

The response will almost always exceed the token limit and be saved to a `.txt` file. When that happens, parse it with the reusable script:

```bash
python scripts/reddit_fetch.py          # auto-uses latest saved file
python scripts/reddit_fetch.py <path>   # explicit file path
python scripts/reddit_fetch.py <path> --comment <comment_id>  # highlight one comment
```

The script (`scripts/reddit_fetch.py`) handles all unescaping, JSON parsing edge cases, and recursive comment printing. Reference it instead of writing ad-hoc parsing code every time.

Do not use `old.reddit.com` — it blocks more aggressively.

---

## JSON Response Structure

### Search / listing response

```json
{
  "data": {
    "after": "t3_abc123",        // pagination cursor
    "children": [
      {
        "kind": "t3",
        "data": {
          "id": "abc123",
          "title": "Post title here",
          "selftext": "Full post body text",
          "author": "username",
          "subreddit": "smallbusiness",
          "permalink":"/r/smallbusiness/comments/abc123/post_title/",
          "url": "https://www.reddit.com/r/smallbusiness/comments/abc123/post_title/",
          "score": 47,
          "num_comments": 12,
          "created_utc": 1741234567,
          "upvote_ratio": 0.94,
          "is_self": true        // true = text post, false = link post
        }
      }
    ]
  }
}
```

**Key fields to extract per post:**

| Field | What it is |
|---|---|
| `id` | Post ID (use to fetch comments) |
| `title` | Post title |
| `selftext` | Full post body (empty string if link post) |
| `author` | Username of poster |
| `subreddit` | Subreddit name (no r/ prefix) |
| `permalink` | Relative URL — append to `https://www.reddit.com` |
| `score` | Net upvotes |
| `num_comments` | Total comment count |
| `created_utc` | Unix timestamp — convert to check recency |
| `archived` | `true` = post is locked after 6 months, no new comments allowed |
| `locked` | `true` = manually locked by mods, no new comments allowed |

### Post + comments response

Fetching a post with `.json` returns an **array of two objects**:

```json
[
  { "data": { "children": [{ "data": { ...post fields... } }] } },
  { "data": { "children": [{ "data": { ...comment... } }] } }
]
```

- Index `[0]` = the post itself (same structure as listing)
- Index `[1]` = top-level comments

### Comment structure

```json
{
  "kind": "t1",
  "data": {
    "id": "xyz789",
    "author": "commenter_username",
    "body": "Comment text here",
    "score": 23,
    "created_utc": 1741234900,
    "replies": {
      "data": {
        "children": [ ...nested comments, same structure... ]
      }
    }
  }
}
```

`replies` is recursive. If no replies, it's an empty string `""` instead of an object.

Kinds: `t1` = comment, `t2` = account, `t3` = post, `t4` = message, `t5` = subreddit. Skip any `kind: "more"` children (these are collapsed comment stubs).

---

## Pagination

If you need more than 25-100 results, use the `after` cursor:

```
https://www.reddit.com/search.json?q=CAM+charges&sort=new&t=day&limit=100&after=t3_abc123
```

The `after` value comes from `data.after` in the previous response. Stop paginating when `data.after` is `null`.

For daily monitoring, 25-50 results per query is usually sufficient.

---

## Rate Limits

- Unauthenticated: roughly 60 requests per minute
- Space requests at least 1 second apart when doing bulk scans
- If you get a 429, wait and retry once. Do not loop.

---

## Daily Monitoring Workflow

1. Load `keywords.md` from the `reddit-marketing` skill
2. For each query in the "Quick Daily Scan" section, fetch:
   ```
   https://www.reddit.com/search.json?q=QUERY&sort=new&t=day&limit=25
   ```
3. For subreddit-targeted queries, use `restrict_sr=1`
4. For each result, extract: `title`, `selftext`, `author`, `subreddit`, `permalink`, `score`, `num_comments`, `created_utc`, `archived`, `locked`
5. Filter: skip posts older than 24h (check `created_utc` against current time minus 86400 seconds)
5a. Filter: skip posts where `archived: true` or `locked: true` — these accept no new comments, sniper comments will fail silently
6. Score each result using the scoring rubric in `keywords.md`
7. For posts scoring 3+, fetch the full comment thread to read existing replies before drafting a sniper comment:
   ```
   https://www.reddit.com/r/SUBREDDIT/comments/POST_ID.json?limit=25&depth=2
   ```
8. Pass qualifying posts to the `reddit-marketing` skill to draft a sniper comment

---

## Common Issues

| Problem | Fix |
|---|---|
| Response is HTML (login page) | Make sure URL ends in `.json`. Do not use `reddit.com/login` redirects. |
| `selftext` is `"[removed]"` | Post was removed by mods. Skip it. |
| `selftext` is `""` | Link post, not text post. The content is at `url`, not in selftext. |
| `archived: true` | Post is older than 6 months. Comments are locked — skip for sniper use. |
| `locked: true` | Manually locked by mods. Comments are locked — skip for sniper use. |
| `replies` is `""` instead of object | No replies on that comment. Treat as leaf node. |
| `kind: "more"` in children | Collapsed comments not loaded. Ignore — don't recurse into these. |
| 429 Too Many Requests | Wait 60 seconds. Reduce request frequency. Do not retry in a loop. |

---

## Quick Reference: Build a URL

```
# Search all Reddit, last 24h, newest first
https://www.reddit.com/search.json?q=CAM+reconciliation&sort=new&t=day&limit=25

# Same, scoped to r/smallbusiness
https://www.reddit.com/r/smallbusiness/search.json?q=NNN+lease&sort=new&t=day&restrict_sr=1&limit=25

# All new posts in r/legaladvice (no keyword filter)
https://www.reddit.com/r/legaladvice/new.json?limit=50

# Fetch post + top 25 comments, 2 levels deep
https://www.reddit.com/r/smallbusiness/comments/abc123.json?limit=25&depth=2
```
