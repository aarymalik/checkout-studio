/**
 * What the two emails say.
 *
 * Kept apart from the sending so the wording can be read, reviewed and tested
 * without a network in the way.
 *
 * Both are short and both say what to do if it was not you, because a password
 * reset nobody asked for is the first sign of an account being taken.
 */

export interface Composed {
  subject: string
  text: string
  html: string
}

function layout(heading: string, body: string, action: { label: string; url: string }): string {
  // Deliberately plain. Mail clients strip stylesheets, rewrite colours and
  // ignore most of what a browser would honour, so anything elaborate here
  // arrives as something else.
  return [
    `<h1>${heading}</h1>`,
    `<p>${body}</p>`,
    `<p><a href="${action.url}">${action.label}</a></p>`,
    `<p>If the link does not work, paste this into your browser:<br>${action.url}</p>`,
  ].join("\n")
}

export function verificationEmail(url: string): Composed {
  const body =
    "Confirm this address to finish setting up your Checkout Studio account. " +
    "The link works once and expires in 24 hours."

  return {
    subject: "Confirm your email address",
    text: `${body}\n\n${url}\n\nIf you did not create an account, ignore this email and nothing will happen.`,
    html: layout("Confirm your email address", body, { label: "Confirm address", url }),
  }
}

export function passwordResetEmail(url: string): Composed {
  const body =
    "Someone asked to reset the password for this account. " +
    "The link works once and expires in an hour."

  return {
    subject: "Reset your password",
    text:
      `${body}\n\n${url}\n\n` +
      "If it was not you, you can ignore this email — your password has not changed. " +
      "If you receive these repeatedly, someone may know your address.",
    html: layout("Reset your password", body, { label: "Choose a new password", url }),
  }
}
