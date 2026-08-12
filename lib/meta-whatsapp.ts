/* eslint-disable @typescript-eslint/no-explicit-any */

const META_API_VERSION = "v24.0";

function graphUrl(path: string) {
  return `https://graph.facebook.com/${META_API_VERSION}${path}`;
}

export async function metaGet(
  path: string,
  accessToken: string,
  fields?: string
) {
  const params = new URLSearchParams();

  params.set("access_token", accessToken);

  if (fields) {
    params.set("fields", fields);
  }

  const response = await fetch(
    `${graphUrl(path)}?${params.toString()}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error?.message ||
        `Meta GET failed: ${response.status}`
    );
  }

  return data;
}

export async function metaPost(
  path: string,
  accessToken: string,
  body: Record<string, any>
) {
  const params = new URLSearchParams();

  params.set("access_token", accessToken);

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined && value !== null) {
      params.set(
        key,
        typeof value === "object"
          ? JSON.stringify(value)
          : String(value)
      );
    }
  }

  const response = await fetch(
    graphUrl(path),
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || data?.error) {
    throw new Error(
      data?.error?.message ||
        `Meta POST failed: ${response.status}`
    );
  }

  return data;
}
