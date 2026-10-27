/* Interação do mascote: o corpo acompanha o cursor, troca de pose e responde ao formulário.
   Este script é carregado somente em index.html e login.html. */
(function () {
    'use strict';

    const allowedPoses = new Set(['presenting', 'pointing', 'writing', 'ok']);
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const roots = document.querySelectorAll('.rf-interactive-area');
    const defaultMessages = {
        presenting: 'Olá! Vamos colocar seus planos no caminho certo.',
        pointing: 'É por aqui! Dê o próximo passo na sua rota.',
        writing: 'Organização é o primeiro passo para avançar.',
        ok: 'Boa escolha. Vamos construir essa rota juntos.'
    };

    function initArea(area) {
        const stage = area.querySelector('[data-rf-mascot-stage]');
        if (!stage) return;

        const motion = stage.querySelector('[data-rf-mascot-motion]');
        const figures = Array.from(stage.querySelectorAll('[data-mascot-pose]'));
        const message = stage.querySelector('.rf-mascot-message');
        let currentPose = 'presenting';
        let pointerWasInStage = false;

        function copyFor(pose) {
            if (!message) return defaultMessages[pose] || defaultMessages.presenting;
            const key = 'copy' + pose.charAt(0).toUpperCase() + pose.slice(1);
            return message.dataset[key] || defaultMessages[pose] || defaultMessages.presenting;
        }

        function setPose(pose, customMessage) {
            if (!allowedPoses.has(pose)) pose = 'presenting';
            currentPose = pose;
            figures.forEach((figure) => {
                const active = figure.dataset.mascotPose === pose;
                figure.classList.toggle('is-active', active);
                figure.setAttribute('aria-hidden', 'true');
            });
            stage.dataset.pose = pose;
            if (message) message.textContent = customMessage || copyFor(pose);
        }

        function resetBodyFollow() {
            if (!motion) return;
            motion.style.setProperty('--rf-follow-x', '0px');
            motion.style.setProperty('--rf-follow-y', '0px');
            motion.style.setProperty('--rf-tilt-x', '0deg');
            motion.style.setProperty('--rf-tilt-y', '0deg');
        }

        function trackPointer(event) {
            if (!motion || prefersReducedMotion || event.pointerType === 'touch') return;
            const rect = area.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const nx = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
            const ny = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
            const followX = (nx - 0.5) * 23;
            const followY = (ny - 0.5) * 15;
            const tiltX = (nx - 0.5) * 7.5;
            const tiltY = (0.5 - ny) * 4;
            motion.style.setProperty('--rf-follow-x', followX.toFixed(1) + 'px');
            motion.style.setProperty('--rf-follow-y', followY.toFixed(1) + 'px');
            motion.style.setProperty('--rf-tilt-x', tiltX.toFixed(2) + 'deg');
            motion.style.setProperty('--rf-tilt-y', tiltY.toFixed(2) + 'deg');

            const inStage = stage.contains(event.target);
            if (inStage) {
                pointerWasInStage = true;
                const stageRect = stage.getBoundingClientRect();
                const sx = (event.clientX - stageRect.left) / stageRect.width;
                const sy = (event.clientY - stageRect.top) / stageRect.height;
                if (sx > 0.63 && sy > 0.14 && sy < 0.72) setPose('pointing');
                else if (sy > 0.76) setPose('writing');
                else if (sx < 0.27 && sy < 0.66) setPose('ok');
                else setPose('presenting');
                return;
            }

            const explicitPose = event.target.closest && event.target.closest('[data-rf-pose]');
            if (explicitPose) {
                setPose(explicitPose.dataset.rfPose);
                return;
            }

            if (area.classList.contains('rf-login-main')) {
                const focusedField = document.activeElement && document.activeElement.matches('#email, #senha');
                if (!focusedField && event.target.closest && event.target.closest('.rf-auth-card')) {
                    setPose('pointing');
                } else if (!event.target.closest || !event.target.closest('.rf-auth-card')) {
                    setPose('presenting');
                }
            } else if (!pointerWasInStage) {
                setPose('presenting');
            }
        }

        area.addEventListener('pointermove', trackPointer, { passive: true });
        area.addEventListener('pointerleave', () => {
            pointerWasInStage = false;
            resetBodyFollow();
            setPose('presenting');
        });

        area.addEventListener('pointerover', (event) => {
            const target = event.target.closest && event.target.closest('[data-rf-pose]');
            if (target) setPose(target.dataset.rfPose);
        });

        area.addEventListener('pointerout', (event) => {
            const target = event.target.closest && event.target.closest('[data-rf-pose]');
            if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
            if (!(area.classList.contains('rf-login-main') && event.relatedTarget && event.relatedTarget.closest && event.relatedTarget.closest('.rf-auth-card'))) {
                setPose('presenting');
            }
        });

        area.addEventListener('focusin', (event) => {
            if (event.target.matches('#email')) setPose('pointing', 'Vamos começar por aqui. Digite seu e-mail.');
            if (event.target.matches('#senha')) setPose('pointing', 'Agora, informe sua senha com segurança.');
        });

        area.addEventListener('input', (event) => {
            if (!event.target.matches('#email, #senha')) return;
            const email = area.querySelector('#email');
            const password = area.querySelector('#senha');
            if (email && password && email.value.trim() && password.value && email.checkValidity()) {
                setPose('ok', 'Pronto para seguir! Confira os dados e entre na sua rota.');
            } else if (event.target.matches('#email') && event.target.value.trim()) {
                setPose('writing', 'Um passo de cada vez. Vamos com calma.');
            } else if (event.target.matches('#senha')) {
                setPose('pointing', 'Sua senha está protegida.');
            }
        });

        area.addEventListener('submit', (event) => {
            if (event.target && event.target.matches('#loginForm')) {
                setPose('pointing', 'Só um instante. Estou preparando sua rota.');
            }
        });

        setPose('presenting');
        return { setPose, stage, resetBodyFollow };
    }

    const instances = Array.from(roots).map(initArea).filter(Boolean);
    window.RotaMascote = {
        setPose(pose, message) {
            const instance = instances.find((item) => item.stage.closest('.rf-login-stage')) || instances[0];
            if (instance) instance.setPose(pose, message);
        }
    };
})();
