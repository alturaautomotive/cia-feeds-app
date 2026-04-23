"use client";

import { useState } from "react";

interface Props {
  slug: string;
  phone: string | null;
  fbPageId: string | null;
  vertical: string;
  catalogApiUrl: string;
  ctaPreference: string | null;
  defaultLandingBaseUrl: string;
  translationLang?: string;
  translationTone?: string;
  metaPixelId?: string;
}

export default function EmbedWidgetCard({
  slug,
  phone,
  fbPageId,
  vertical,
  catalogApiUrl,
  ctaPreference,
  defaultLandingBaseUrl,
  translationLang = "en",
  translationTone = "professional",
  metaPixelId = "",
}: Props) {
  const [copied, setCopied] = useState(false);

  function escapeJS(s: string): string {
    return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\x3c').replace(/>/g, '\\x3e');
  }

  const effectiveLandingBase = defaultLandingBaseUrl;

  function generateSnippet(): string {
    // Validate that catalogApiUrl points to our own domain
    const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
    const safeCatalogApiUrl = catalogApiUrl.startsWith(appOrigin + '/') || catalogApiUrl.startsWith('/') ? catalogApiUrl : '';
    const escapedUrl = escapeJS(safeCatalogApiUrl);
    const escapedSlug = escapeJS(slug);
    const escapedLandingBase = escapeJS(effectiveLandingBase);
    const escapedLang = escapeJS(translationLang);
    const escapedTone = escapeJS(translationTone);
    const escapedPixelId = escapeJS(metaPixelId);

    return `<script>
(function(){
  var landingBase = '${escapedLandingBase}';
  var escapedSlug = '${escapedSlug}';
  var container = document.createElement('div');
  container.id = 'cia-catalog-widget';
  container.setAttribute('data-lang', '${escapedLang}');
  container.setAttribute('data-tone', '${escapedTone}');
  container.setAttribute('data-pixel-id', '${escapedPixelId}');
  document.currentScript.parentElement.appendChild(container);

  fetch('${escapedUrl}')
    .then(function(r){ return r.json(); })
    .then(function(data){
      var dealer = data.dealer;
      var items = data.items || [];
      var savedItems = items;

      var wrapper = document.createElement('div');
      wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      wrapper.style.maxWidth = '1200px';
      wrapper.style.margin = '0 auto';
      wrapper.style.padding = '16px';

      /* --- Build heading --- */
      var headingText = dealer.name + ' Catalog';

      function makeHeading() {
        var h = document.createElement('h2');
        h.textContent = headingText;
        h.style.fontSize = '24px';
        h.style.fontWeight = '700';
        h.style.color = '#111827';
        h.style.marginBottom = '16px';
        return h;
      }

      /* --- Dynamic CTA buttons --- */
      var pref = dealer.ctaPreference;
      var dPhone = dealer.phone;
      var fb = dealer.fbPageId;
      var ctaMap = {
        sms:       { ok: !!dPhone, href: 'sms:' + (dPhone||'') + '?body=' + encodeURIComponent("Hi, I'm interested in your inventory"), label: 'Text Us' },
        whatsapp:  { ok: !!dPhone, href: 'https://wa.me/' + (dPhone||'').replace(/\\D/g,'') + '?text=' + encodeURIComponent("Hi, I'm interested in your inventory"), label: 'WhatsApp Us' },
        messenger: { ok: !!fb, href: 'https://m.me/' + (fb||''), label: 'Message on Messenger', target: '_blank' }
      };

      var buttons = [];
      if (pref && ctaMap[pref] && ctaMap[pref].ok) {
        buttons.push(ctaMap[pref]);
      } else {
        ['sms','whatsapp','messenger'].forEach(function(k){ if(ctaMap[k].ok) buttons.push(ctaMap[k]); });
      }

      function makeCta() {
        if (!buttons.length) return null;
        var cta = document.createElement('div');
        cta.style.display = 'flex';
        cta.style.gap = '12px';
        cta.style.marginTop = '20px';
        cta.style.justifyContent = 'center';
        cta.style.flexWrap = 'wrap';

        buttons.forEach(function(b, i){
          var a = document.createElement('a');
          a.href = b.href;
          a.textContent = b.label;
          if (b.target) a.target = b.target;
          a.style.display = 'inline-block';
          a.style.padding = '10px 24px';
          a.style.borderRadius = '6px';
          a.style.textDecoration = 'none';
          a.style.fontWeight = '600';
          a.style.fontSize = '14px';
          if (i === 0) {
            a.style.backgroundColor = '#4f46e5';
            a.style.color = '#fff';
          } else {
            a.style.backgroundColor = '#fff';
            a.style.color = '#4f46e5';
            a.style.border = '2px solid #4f46e5';
          }
          cta.appendChild(a);
        });
        return cta;
      }

      /* --- Build catalog grid --- */
      function buildCatalog(itemsList) {
        var grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(350px, 1fr))';
        grid.style.gap = '16px';

        itemsList.forEach(function(item){
          var card = document.createElement('div');
          card.style.border = '1px solid #e5e7eb';
          card.style.borderRadius = '8px';
          card.style.overflow = 'hidden';
          card.style.backgroundColor = '#fff';
          card.style.cursor = 'pointer';
          card.style.transition = 'box-shadow 0.2s';

          card.addEventListener('mouseenter', function(){ card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; });
          card.addEventListener('mouseleave', function(){ card.style.boxShadow = 'none'; });

          if(item.image){
            var img = document.createElement('img');
            img.src = item.image;
            img.alt = item.title || '';
            img.style.width = '100%';
            img.style.height = '250px';
            img.style.objectFit = 'cover';
            img.style.display = 'block';
            card.appendChild(img);
          } else {
            var ph = document.createElement('div');
            ph.style.width = '100%';
            ph.style.height = '250px';
            ph.style.backgroundColor = '#f3f4f6';
            ph.style.display = 'flex';
            ph.style.alignItems = 'center';
            ph.style.justifyContent = 'center';
            ph.style.color = '#9ca3af';
            ph.style.fontSize = '14px';
            ph.textContent = 'No image';
            card.appendChild(ph);
          }

          var body = document.createElement('div');
          body.style.padding = '12px';

          var title = document.createElement('div');
          title.textContent = item.title || 'Untitled';
          title.style.fontWeight = '600';
          title.style.fontSize = '15px';
          title.style.color = '#111827';
          title.style.marginBottom = '4px';
          body.appendChild(title);

          if(item.price != null){
            var price = document.createElement('div');
            price.textContent = '$' + Number(item.price).toLocaleString('en-US');
            price.style.color = '#4f46e5';
            price.style.fontWeight = '700';
            price.style.fontSize = '15px';
            price.style.marginBottom = '8px';
            body.appendChild(price);
          }

          if(item.details){
            var chips = document.createElement('div');
            chips.style.display = 'flex';
            chips.style.flexWrap = 'wrap';
            chips.style.gap = '6px';
            var keys = Object.keys(item.details).slice(0, 4);
            keys.forEach(function(k){
              var chip = document.createElement('span');
              chip.textContent = k + ': ' + item.details[k];
              chip.style.fontSize = '12px';
              chip.style.backgroundColor = '#f3f4f6';
              chip.style.color = '#374151';
              chip.style.padding = '2px 8px';
              chip.style.borderRadius = '9999px';
              chips.appendChild(chip);
            });
            body.appendChild(chips);
          }

          card.appendChild(body);

          card.addEventListener('click', function(){ showLandingView(item.id); });
          grid.appendChild(card);
        });

        /* --- Translate titles & detail chips if lang !== en --- */
        if(container.dataset.lang !== 'en'){
          var tSlug = '${escapedSlug}';
          var lang = container.dataset.lang;
          var tone = container.dataset.tone;
          var titles = grid.querySelectorAll('[style*="fontWeight: 600"]');
          var chipEls = grid.querySelectorAll('span[style*="backgroundColor: #f3f4f6"]');
          var els = [];
          for(var ti=0;ti<titles.length;ti++) els.push(titles[ti]);
          for(var ci=0;ci<chipEls.length;ci++) els.push(chipEls[ci]);
          els.forEach(function(el){
            if(!el.textContent.match(/^\\$?\\d/)){
              fetch(landingBase + '/api/translate', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({slug: tSlug, text: el.textContent.trim(), lang: lang, tone: tone})
              }).then(function(res){ if(res.ok) return res.json(); }).then(function(d){
                if(d && d.translated) el.textContent = d.translated;
              }).catch(function(){});
            }
          });
        }

        return grid;
      }

      /* --- View switching --- */
      function showCatalogView() {
        wrapper.innerHTML = '';
        wrapper.appendChild(makeHeading());
        wrapper.appendChild(buildCatalog(savedItems));
        var ctaEl = makeCta();
        if (ctaEl) wrapper.appendChild(ctaEl);
      }

      function showLandingView(itemId) {
        wrapper.innerHTML = '';

        var backBtn = document.createElement('button');
        backBtn.textContent = '\\u2190 Back to catalog';
        backBtn.style.background = '#fff';
        backBtn.style.border = '1px solid #e5e7eb';
        backBtn.style.borderRadius = '6px';
        backBtn.style.padding = '8px 16px';
        backBtn.style.fontSize = '14px';
        backBtn.style.color = '#4f46e5';
        backBtn.style.cursor = 'pointer';
        backBtn.style.margin = '16px auto';
        backBtn.style.display = 'block';
        backBtn.style.fontWeight = '600';
        backBtn.addEventListener('click', function(){ showCatalogView(); });
        wrapper.appendChild(backBtn);

        var iframe = document.createElement('iframe');
        iframe.src = landingBase + '/w/' + escapedSlug + '/' + itemId;
        iframe.style.width = '100%';
        iframe.style.height = '800px';
        iframe.style.border = 'none';
        iframe.style.borderRadius = '8px';
        iframe.style.background = '#f9fafb';
        iframe.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
        iframe.loading = 'lazy';
        wrapper.appendChild(iframe);

        container.scrollIntoView({behavior:'smooth',block:'start'});
      }

      /* --- Initial render --- */
      wrapper.appendChild(makeHeading());
      wrapper.appendChild(buildCatalog(items));
      var ctaEl = makeCta();
      if (ctaEl) wrapper.appendChild(ctaEl);

      container.appendChild(wrapper);

      /* --- Meta Pixel --- */
      var pixelId = container.dataset.pixelId;
      if(pixelId){
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', pixelId);
        fbq('track', 'PageView');
        var sample = items[0];
        if(sample){
          fbq('track', 'ViewContent', {
            content_ids: [sample.id],
            content_type: 'product',
            value: sample.price || 0,
            currency: 'USD'
          });
        }
      }
    })
    .catch(function(){
      container.innerHTML = '<p style="text-align:center;color:#6b7280;padding:32px;">Could not load catalog.</p>';
    });
})();
</script>`;
  }

  const snippet = generateSnippet();

  const previewLines = snippet.split("\n").slice(0, 5).join("\n") + "\n  ...";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = snippet;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const hasContact = Boolean(phone) || Boolean(fbPageId);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-7 mt-6">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
        Embed Catalog Widget
      </p>
      <p className="text-sm text-gray-600 mb-4">
        Paste this code on any website to display a live catalog with contact
        buttons.
      </p>

      <pre className="bg-gray-100 rounded-md p-3 text-xs font-mono overflow-x-auto text-gray-700 mb-4 whitespace-pre-wrap">
        <code>{previewLines}</code>
      </pre>

      <button
        onClick={handleCopy}
        className={`whitespace-nowrap px-4 py-2.5 rounded-md text-sm font-semibold text-white transition-colors ${
          copied
            ? "bg-green-600 hover:bg-green-700"
            : "bg-indigo-600 hover:bg-indigo-700"
        }`}
      >
        {copied ? "Copied!" : "Copy Embed Code"}
      </button>

      <p className="text-xs text-gray-400 mt-3">
        Widget auto-updates when your catalog changes.
      </p>

      {(ctaPreference === "whatsapp" || ctaPreference === "sms") && !phone && (
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-800">
            Your CTA preference is set to {ctaPreference === "sms" ? "Text Us" : "WhatsApp"}, but no phone number is on file. Add one in Profile &amp; Settings.
          </p>
        </div>
      )}
      {ctaPreference === "messenger" && !fbPageId && (
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-800">
            Your CTA preference is set to Messenger, but no Facebook Page is connected. Connect one in Profile &amp; Settings.
          </p>
        </div>
      )}
      {!hasContact && !ctaPreference && (
        <div className="mt-4 rounded-md bg-amber-50 border border-amber-200 px-4 py-3">
          <p className="text-sm text-amber-800">
            Add a phone number or connect Meta in Profile &amp; Settings to
            enable contact buttons.
          </p>
        </div>
      )}
    </div>
  );
}
