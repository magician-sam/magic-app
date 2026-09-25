(() => {
        const ua = navigator.userAgent;
        const onIphone = /iPhone|iPad|iPod/.test(ua);
        const onAndroid = /Android/.test(ua);
        const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
        if (onIphone) document.getElementById('iphone-steps').classList.add('active');
        if (onAndroid) document.getElementById('android-steps').classList.add('active');
        const button = document.getElementById('install-now');
        const status = document.getElementById('install-status');
        if (installed) status.textContent = 'Magic by Sam is already on this phone.';
        let promptEvent;
        window.addEventListener('beforeinstallprompt', event => {
          event.preventDefault();
          promptEvent = event;
          if (!installed) button.hidden = false;
        });
        button.addEventListener('click', async () => {
          if (!promptEvent) return;
          button.hidden = true;
          await promptEvent.prompt();
          const result = await promptEvent.userChoice;
          status.textContent = result.outcome === 'accepted' ? 'Magic by Sam is being added to your phone.' : 'You can install it later from your browser menu.';
          promptEvent = undefined;
        });
        window.addEventListener('appinstalled', () => { button.hidden = true; status.textContent = 'Magic by Sam is ready on your home screen.'; });
      })();