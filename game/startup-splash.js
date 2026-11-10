export async function startupSplash(){
  const element=document.createElement('div');
  element.id='startup-splash';
  const logo=new Image();
  logo.alt='打到天亮';
  logo.src='assets/brand/dawn-logo.png';
  logo.width=838;
  logo.height=688;
  element.append(logo);
  // A missing optional splash image must not prevent entry or obscure a loading error.
  try{await logo.decode();}catch{return;}
  document.body.append(element);
  try{
    await new Promise(resolve=>setTimeout(resolve,1500));
  }finally{element.remove();}
}
