const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const VIP_CODES = {
  'VISUALVIP':      { tier: 'visual',      max: 5 },
  'PUBLICATIONVIP': { tier: 'publication', max: 5 }
};

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://smcantrellbooks.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { tier, billing, promo, email } = req.body;

    const PRICES = {
      visual:      { monthly: 'price_VISUAL_MONTHLY', annual: 'price_VISUAL_ANNUAL' },
      publication: { monthly: 'price_PUB_MONTHLY',    annual: 'price_PUB_ANNUAL' }
    };

    const priceId = PRICES[tier] && PRICES[tier][billing];
    if (!priceId) return res.status(400).json({ error: 'Invalid tier or billing period' });

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: { trial_period_days: 14 },
      success_url: 'https://creatives.smcantrellbooks.com/confirm.html?session_id={CHECKOUT_SESSION_ID}',
      cancel_url:  'https://smcantrellbooks.com/join',
      allow_promotion_codes: true,
    };

    if (email) sessionParams.customer_email = email;

    // ── VIP SLOT CHECK ──
    if (promo && VIP_CODES[promo.toUpperCase()]) {
      const vip = VIP_CODES[promo.toUpperCase()];

      // Count how many times this code has been used
      const { count, error } = await supabase
        .from('beta_slots')
        .select('*', { count: 'exact', head: true })
        .eq('promo_code', promo.toUpperCase())
        .eq('tier', vip.tier);

      if (error) throw error;

      if (count >= vip.max) {
        return res.status(400).json({ 
          error: `Sorry, all ${vip.max} ${vip.tier} VIP slots have been claimed.` 
        });
      }

      // Slot available — apply 1 year free coupon from Stripe
      const coupons = await stripe.coupons.list({ limit: 20 });
      const match = coupons.data.find(c => 
        c.name === promo.toUpperCase() || c.id === promo.toUpperCase()
      );
      if (match) sessionParams.discounts = [{ coupon: match.id }];

      // Reserve the slot
      await supabase.from('beta_slots').insert({
        promo_code: promo.toUpperCase(),
        tier:       vip.tier,
        email:      email || null,
        claimed_at: new Date().toISOString()
      });

    } else if (promo) {
      // Regular promo code (PROMO-14DAYSTRIAL etc)
      const coupons = await stripe.coupons.list({ limit: 20 });
      const match = coupons.data.find(c => c.name === promo || c.id === promo);
      if (match) sessionParams.discounts = [{ coupon: match.id }];
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.status(200).json({ url: session.url });

  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
};
