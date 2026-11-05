import { AUDIO_ASSETS } from '../../packages/game-ui/src/audio';
for(const [name,url] of Object.entries(AUDIO_ASSETS)){
 const music=['menu','race','results'].includes(name), article=document.createElement('article'), title=document.createElement('h3'), player=document.createElement('audio');
 title.textContent=name;player.controls=true;player.preload='none';player.loop=music;player.src=url;article.append(title,player);document.querySelector(music?'#music':'#effects')!.append(article);
}
document.querySelector('#stop')!.addEventListener('click',()=>{for(const player of document.querySelectorAll('audio')){player.pause();player.currentTime=0;}});
