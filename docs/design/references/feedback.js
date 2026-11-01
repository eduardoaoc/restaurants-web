const reviews=[
 ['Eduardo Test','9 oct 2026, 0:58','04','Lorena Martín',5],
 ['Jefe Ts','7 oct 2026, 20:53','11','Lorena Martín',3],
 ['Marta Díaz','30 sept 2026, 16:51','03','Lorena Martín',4],
 ['Carlos Ruiz','30 sept 2026, 16:48','10','Sofía García',3],
 ['Ana López','30 sept 2026, 16:46','07','Sin camarero asignado',5],
 ['Pedro Gómez','30 sept 2026, 16:42','06','Mateo Ruiz',1],
 ['Luis Fernández','29 sept 2026, 2:22','08','Mateo Ruiz',5],
 ['Marta Gómez','29 sept 2026, 2:07','11','Sin camarero asignado',5],
 ['Test Usuario','24 sept 2026, 23:01','15','Sin camarero asignado',1],
 ['JEEF BGGE','17 sept 2026, 22:42','04','Lorena Martín',5]
];
document.title='Ritma · Feedback';
document.querySelector('main').innerHTML=`<section class="page-heading feedback-heading"><div><h1>Feedback</h1><p>Valoraciones de tus clientes después de cada visita.</p></div></section><section class="feedback-metrics" aria-label="Resumen de valoraciones">${[['Total de valoraciones','10'],['General','3.7'],['Comida','3.7'],['Servicio','3.6'],['Espera','3.3']].map(([label,value],i)=>`<article class="feedback-metric"><div class="feedback-metric-label">${icon(i===0?'Equipo':'Feedback')}<h2>${label}</h2></div><div class="feedback-value">${value}${i?'<span>/ 5</span>':''}</div>${i?'<p>Media de las valoraciones cargadas</p>':''}</article>`).join('')}</section><section class="panel review-panel"><div class="review-panel-header"><h2>Valoraciones</h2></div><div class="review-columns" aria-hidden="true"><span>CLIENTE Y VISITA</span><span>CAMARERO</span><span>VALORACIÓN</span></div><ol class="review-list">${reviews.map(([name,date,table,waiter,score])=>`<li class="review-row"><div class="review-visit"><strong>${name}</strong><div class="review-meta"><time>${date}</time><span class="meta-dot">·</span><span>Mesa ${table}</span></div></div><div class="review-waiter ${waiter.startsWith('Sin ')?'unassigned-waiter':''}">${icon('Equipo')}<span>${waiter}</span></div><div class="review-score" aria-label="${score} de 5 estrellas"><span class="stars" aria-hidden="true">${Array.from({length:5},(_,i)=>`<span class="${i<score?'filled':'empty'}">★</span>`).join('')}</span><strong>${score}<span>/5</span></strong></div></li>`).join('')}</ol></section>`;
document.querySelector('.breadcrumb strong').textContent='Feedback';
document.querySelectorAll('.nav-item').forEach((el,i)=>{el.classList.toggle('active',i===7);el.removeAttribute('aria-current');if(i===7){el.removeAttribute('data-detail');el.setAttribute('aria-current','page')}if(i===0){el.removeAttribute('data-detail');el.onclick=()=>location.href='/'}if(i===2){el.removeAttribute('data-detail');el.onclick=()=>location.href='/servicio.html'}});
