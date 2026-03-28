// Default TipTap document structure for a new blank proposal
export const blankProposalContent = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Proposal Title" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Prepared for: [Client Name]",
        },
      ],
    },
    {
      type: "horizontalRule",
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Overview" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Describe the project scope and objectives here...",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Deliverables" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "List what will be delivered...",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Timeline" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Outline the project timeline...",
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Investment" }],
    },
    {
      type: "pricingTable",
      content: [
        {
          type: "pricingRow",
          attrs: { description: "Service item", amount: 0 },
        },
      ],
    },
    {
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "Terms & Conditions" }],
    },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Add your standard terms here...",
        },
      ],
    },
  ],
};
