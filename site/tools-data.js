/**
 * The catalogue shown on the launcher page (index.html).
 * Keep in sync with the folders in /tools - `npm run check:structure` fails if
 * a tool is missing here. It is a .js file (not .json) so the launcher also
 * works when opened straight from disk, where browsers block fetch().
 */
window.TOOLS = [
  {
    id: 'canned-replies',
    title: 'Canned Reply Library',
    tagline: 'Search, fill in and copy ready-made replies with placeholders.',
    replaces: 'reply documents',
    tags: ['canned', 'reply', 'template', 'macro'],
  },
  {
    id: 'ticket-log',
    title: 'Ticket Log & SLA Timer',
    tagline: 'Log tickets, set priority, and see response and resolution deadlines in business hours.',
    replaces: 'ticket spreadsheets',
    tags: ['ticket', 'sla', 'priority'],
  },
  {
    id: 'escalation-tracker',
    title: 'Escalation Tracker',
    tagline: 'Track escalated cases by level, owner and next-update due date.',
    replaces: 'escalation e-mail threads',
    tags: ['escalation', 'owner', 'followup'],
  },
  {
    id: 'csat-nps',
    title: 'CSAT & NPS Calculator',
    tagline: 'Work out CSAT and NPS from scores or counts, by period, with a trend.',
    replaces: 'survey spreadsheets',
    tags: ['csat', 'nps', 'survey', 'score'],
  },
  {
    id: 'backlog-report',
    title: 'Backlog & Response-Time Report',
    tagline: 'Load a ticket export and see backlog age, response and resolution times, by agent and day.',
    replaces: 'weekly report spreadsheets',
    tags: ['backlog', 'report', 'response', 'time'],
  },
  {
    id: 'call-notes',
    title: 'Call & Chat Notes',
    tagline: 'Capture structured notes and get a clean summary and follow-ups to paste into the ticket.',
    replaces: 'free-form notes',
    tags: ['call', 'chat', 'notes', 'summary'],
  },
  {
    id: 'kb-article-builder',
    title: 'Knowledge Base Article Builder',
    tagline: 'Write a how-to or fix article with symptoms, cause and steps; export as Markdown or PDF.',
    replaces: 'wiki drafts',
    tags: ['knowledge', 'base', 'article', 'faq'],
  },
  {
    id: 'refund-calculator',
    title: 'Refund & Credit Calculator',
    tagline: 'Work out prorated and partial refunds in INR with GST reversal and fees.',
    replaces: 'calculator tabs',
    tags: ['refund', 'credit', 'gst', 'prorate'],
  },
  {
    id: 'shift-handover',
    title: 'Shift Handover Notes',
    tagline: 'Write a handover for the next shift: open cases, watch list and reminders, as text or PDF.',
    replaces: 'chat handover messages',
    tags: ['handover', 'shift', 'notes'],
  },
  {
    id: 'followup-planner',
    title: 'Customer Follow-up Planner',
    tagline: 'Never forget a promised call-back: due today, overdue and calendar reminders.',
    replaces: 'sticky notes',
    tags: ['followup', 'callback', 'reminder'],
  },
];
