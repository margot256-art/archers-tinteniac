import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405 };
  }

  try {
    const { subscription, title, body } = JSON.parse(event.body ?? '{}');
    if (!subscription?.endpoint) {
      return { statusCode: 400, body: 'Missing subscription' };
    }

    await webpush.sendNotification(subscription, JSON.stringify({ title, body }));
    return { statusCode: 200 };
  } catch (err) {
    if (err.statusCode === 410) {
      // Subscription expired — caller can clean up
      return { statusCode: 410 };
    }
    console.error('[send-push]', err.message);
    return { statusCode: 500, body: err.message };
  }
};
