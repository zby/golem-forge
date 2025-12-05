# Use Case: Pitch Deck Analyzer

**Priority**: High (first practical tool for daily use)
**Status**: Design

## Context

Processing pitch decks received via email is a recurring task. The goal is to automate the capture, analysis, and archival of pitch decks with minimal friction.

**Email Client**: Hey (web-based at hey.com)

## User Story

**As** an investor/advisor reviewing pitch decks
**I want to** click a button in Hey to process an attached pitch deck
**So that** the deck is automatically analyzed, organized, and saved to my research repository

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Hey Email Client                                │
│                                                                         │
│  From: founder@startup.com                                              │
│  Subject: Series A Pitch Deck - Acme Corp                               │
│                                                                         │
│  Hi, please find attached our pitch deck...                             │
│                                                                         │
│  📎 Acme Corp Series A Deck.pdf                                         │
│                     │                                                   │
│                     │  [🔍 Analyze Pitch Deck]  ← Extension button      │
│                     │                                                   │
└─────────────────────┼───────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Browser Extension                                  │
│                                                                         │
│  1. Download PDF attachment                                             │
│  2. Cache in OPFS                                                       │
│  3. Send to LLM for analysis                                            │
│  4. Extract company name                                                │
│  5. Generate analysis markdown                                          │
│  6. Stage files for commit                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      GitHub Repository                                  │
│                                                                         │
│  pitchdecks/                                                            │
│  └── acme-corp/                                                         │
│      ├── deck.pdf                    (original, renamed)                │
│      ├── analysis.md                 (LLM-generated analysis)           │
│      └── metadata.json               (extracted data)                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Acceptance Criteria

### Detection & Download
- [ ] Extension detects PDF attachments in Hey email view
- [ ] "Analyze Pitch Deck" button appears near attachments
- [ ] PDF is downloaded (investigate Hey's attachment mechanism - direct link or blob?)
- [ ] PDF cached in OPFS before processing

### Analysis
- [ ] LLM extracts company name from PDF content
- [ ] LLM generates structured analysis based on configured rules
- [ ] Analysis includes: company name, sector, stage, ask, key metrics, notes
- [ ] Handles multi-language decks (at least English)

### File Organization
- [ ] Directory name derived from company name
- [ ] Special characters removed/replaced (e.g., "Acme Corp!" → "acme-corp")
- [ ] PDF renamed to consistent format (e.g., "deck.pdf" or "acme-corp-deck.pdf")
- [ ] No filename collisions (append date if company already exists?)

### Git Integration
- [ ] New directory staged for commit
- [ ] Commit message includes company name
- [ ] User approves before push (standard approval flow)
- [ ] Handles case where company directory already exists

## Technical Investigation Needed

### Hey Email Client
- [ ] How are attachments represented in the DOM?
- [ ] Are attachments direct URLs or require authentication?
- [ ] Can we intercept attachment downloads?
- [ ] Content script injection points

```javascript
// Questions to answer:
// 1. What does an attachment link look like in Hey?
//    <a href="???">Acme Corp Series A Deck.pdf</a>
//
// 2. Is it a direct link or does it go through Hey's servers?
//    https://hey.com/attachments/xxx vs https://cdn.hey.com/xxx
//
// 3. Do we need cookies/auth to download?
```

### PDF Processing
- [ ] Which LLMs support native PDF viewing? (Claude, GPT-4V, Gemini)
- [ ] Size limits for PDF attachments to LLM
- [ ] Fallback: PDF text extraction if native viewing unavailable

## Analysis Rules (Configurable)

The analysis worker should follow configurable rules. Initial set:

```yaml
# pitchdeck-analyzer.worker
name: pitchdeck-analyzer
model: anthropic:claude-sonnet-4-20250514  # Needs vision

extract:
  - company_name: "The company or product name"
  - sector: "Industry sector (e.g., Fintech, Healthcare, SaaS)"
  - stage: "Funding stage mentioned (Pre-seed, Seed, Series A, etc.)"
  - ask: "Funding amount being raised, if mentioned"
  - location: "Company headquarters location"
  - founders: "Founder names if visible"
  - key_metrics: "Any traction metrics (ARR, users, growth rate)"

analysis_sections:
  - summary: "2-3 sentence summary of what the company does"
  - strengths: "Key strengths from the deck"
  - concerns: "Potential concerns or questions"
  - market: "Market size and competition notes"
  - verdict: "Initial impression (Interesting / Pass / Need More Info)"
```

## Output Format

### analysis.md

```markdown
# Acme Corp

**Analyzed**: 2024-01-15
**Source**: Email from founder@startup.com

## Overview

| Field | Value |
|-------|-------|
| Sector | B2B SaaS |
| Stage | Series A |
| Ask | $10M |
| Location | San Francisco, CA |

## Summary

Acme Corp is building an AI-powered widget optimizer for enterprise customers...

## Key Metrics

- ARR: $2M
- Growth: 20% MoM
- Customers: 50 enterprise

## Strengths

- Strong founding team with domain expertise
- Clear product-market fit signals
- Efficient capital deployment

## Concerns

- Competitive market with established players
- Customer concentration risk
- ...

## Verdict

**Interesting** - Worth a follow-up call to discuss GTM strategy.

---
*Generated by Golem Forge Pitch Deck Analyzer*
```

### metadata.json

```json
{
  "company_name": "Acme Corp",
  "company_slug": "acme-corp",
  "analyzed_at": "2024-01-15T10:30:00Z",
  "source_email": "founder@startup.com",
  "source_subject": "Series A Pitch Deck - Acme Corp",
  "original_filename": "Acme Corp Series A Deck.pdf",
  "extracted": {
    "sector": "B2B SaaS",
    "stage": "Series A",
    "ask": "$10M",
    "location": "San Francisco, CA"
  },
  "verdict": "interesting"
}
```

## Security Considerations

- **Trust Level**: `session` (user-initiated from email client)
- **PDF Source**: Email attachment (semi-trusted)
- **Sensitive Data**: Pitch decks may contain confidential information
  - Store in private GitHub repo
  - Don't send to analytics/logging services
- **Commit Review**: Always show diff before push

## Implementation Dependencies

From [implementation-plan.md](../implementation-plan.md):

| Dependency | Phase | Status |
|------------|-------|--------|
| Sandbox with OPFS | 5.1 | Not started |
| GitHub sync (Octokit) | 5.2 | Not started |
| Browser extension scaffold | 5.4 | Not started |
| Content script integration | 5.5 | Not started |

**Minimum viable path**: Phase 5 must be complete.

## Future Enhancements

1. **Batch processing**: Analyze multiple decks from a thread
2. **Follow-up tracking**: Link to CRM or note-taking system
3. **Comparison view**: Side-by-side with similar companies
4. **Email draft**: Generate response template based on verdict
5. **Calendar integration**: Suggest meeting slots for "Interesting" verdicts

## Open Questions

1. Should we extract the email sender/subject as additional context?
2. How to handle updates (new deck version from same company)?
3. Should analysis be editable after generation?
4. Integration with existing deal flow tools?
