export async function getOrCreateUnsubscribeToken(
  supabase: {
    from: (table: string) => {
      select: (...args: unknown[]) => any;
      insert: (...args: unknown[]) => any;
    };
  },
  email: string,
): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();

  const { data: existingToken, error: selectError } = await supabase
    .from("email_unsubscribe_tokens")
    .select("token")
    .eq("email", normalizedEmail)
    .is("used_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selectError) {
    console.error("[email-unsubscribe] Failed to load token", selectError);
  }

  if (existingToken?.token) {
    return existingToken.token;
  }

  const token = crypto.randomUUID();
  const { error: insertError } = await supabase
    .from("email_unsubscribe_tokens")
    .insert({
      email: normalizedEmail,
      token,
    });

  if (insertError) {
    console.error("[email-unsubscribe] Failed to create token", insertError);
    throw new Error("Failed to create unsubscribe token");
  }

  return token;
}