"use client";

import { useState } from "react";

interface Props {
  slug: string;
  phone: string | null;
  fbPageId: string | null;
  vertical: string;
  catalogApiUrl: string;
}

export default function EmbedWidgetCard({
  slug,
  phone,
  fbPageId,
  vertical,
  catalogApiUrl,
}: Props) {
  const [copied, setCopied] = useState(false);

  function generateSnippet(): string {
    const smsHref = phone
      ? `sms:${phone}?body=${encodeURIComponent("Hi, I'm interested in your inventory")}`
      : "";
    const messengerHref = fbPageId
      ? `https://m.me/${fbPageId}`
      : "";

    return `<script>
(function(){
  var container = document.createElement('div');
  container.id = 'cia-catalog-widget';
  document.currentScript.parentElement.appendChild(container);

  fetch('${catalogApiUrl}')
    .then(function(r){ return r.json(); })
    .then(function(data){
      var dealer = data.dealer;
      var items = data.items || [];

      var wrapper = document.createElement('div');
      wrapper.style.fontFamily = 'system-ui, -apple-system, sans-serif';
      wrapper.style.maxWidth = '1200px';
      wrapper.style.margin = '0 auto';
      wrapper.style.padding = '16px';

      var heading = document.createElement('h2');
      heading.textContent = dealer.name + ' Catalog';
      heading.style.fontSize = '24px';
      heading.style.fontWeight = '700';
      heading.style.color = '#111827';
      heading.style.marginBottom = '16px';
      wrapper.appendChild(heading);

      var grid = document.createElement('div');
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(260px, 1fr))';
      grid.style.gap = '16px';

      items.forEach(function(item){
        var card = document.createElement('div');
        card.style.border = '1px solid #e5e7eb';
        card.style.borderRadius = '8px';
        card.style.overflow = 'hidden';
        card.style.backgroundColor = '#fff';

        if(item.image){
          var img = document.createElement('img');
          img.src = item.image;
          img.alt = item.title || '';
          img.style.width = '100%';
          img.style.height = '180px';
          img.style.objectFit = 'cover';
          img.style.display = 'block';
          card.appendChild(img);
        } else {
          var ph = document.createElement('div');
          ph.style.width = '100%';
          ph.style.height = '180px';
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
        grid.appendChild(card);
      });

      wrapper.appendChild(grid);
${phone || fbPageId ? `
      var cta = document.createElement('div');
      cta.style.display = 'flex';
      cta.style.gap = '12px';
      cta.style.marginTop = '20px';
      cta.style.justifyContent = 'center';
      cta.style.flexWrap = 'wrap';
${phone ? `
      var smsBtn = document.createElement('a');
      smsBtn.href = '${smsHref}';
      smsBtn.textContent = 'Text Us';
      smsBtn.style.display = 'inline-block';
      smsBtn.style.padding = '10px 24px';
      smsBtn.style.backgroundColor = '#4f46e5';
      smsBtn.style.color = '#fff';
      smsBtn.style.borderRadius = '6px';
      smsBtn.style.textDecoration = 'none';
      smsBtn.style.fontWeight = '600';
      smsBtn.style.fontSize = '14px';
      cta.appendChild(smsBtn);
` : ""}${fbPageId ? `
      var msgBtn = document.createElement('a');
      msgBtn.href = '${messengerHref}';
      msgBtn.target = '_blank';
      msgBtn.textContent = 'Message on Messenger';
      msgBtn.style.display = 'inline-block';
      msgBtn.style.padding = '10px 24px';
      msgBtn.style.backgroundColor = '#fff';
      msgBtn.style.color = '#4f46e5';
      msgBtn.style.border = '2px solid #4f46e5';
      msgBtn.style.borderRadius = '6px';
      msgBtn.style.textDecoration = 'none';
      msgBtn.style.fontWeight = '600';
      msgBtn.style.fontSize = '14px';
      cta.appendChild(msgBtn);
` : ""}
      wrapper.appendChild(cta);
` : ""}
      container.appendChild(wrapper);
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
      const input = document.createElement("input");
      input.value = snippet;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
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

      {!hasContact && (
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
