//hide parent of every parent of element which have classs name "username" and that have text "viewer"
var pathArray = window.location.pathname.split( '/' )
setInterval(() => {

    const username = document.querySelectorAll('.username');
    username.forEach(function (item) {
        if (item.innerText === 'viewer') {
            console.log('hiding viewer');
            item.parentElement.style.display = 'none';
        }
        if (item.innerText === 'viewer (me)') {
            console.log('hiding viewer');
            item.parentElement.style.display = 'none';
            document.getElementById('startVideoButton').style.display = 'none';
            document.getElementById('startAudioButton').style.display = 'none';
        }
        if(!item.innerText.includes('(me)') && item.innerText !== 'stream' && pathArray[1] !== 'view'
        ){
            // item.parentElement.style.display = 'none';
        }
        if (item.innerText === 'viewer (me)') {
            console.log('hiding controller');
            const controller = document.getElementById('control');
            if(controller){
                //remove all children from the controller
                while (controller.firstChild) {
                    controller.removeChild(controller.firstChild);
                }
                
            }
            // item.parentElement.style.display = 'none';
        }else if(item.innerText.includes('(me)') && username.length >2){
            console.log('moving me');
            // move it's position to the top right 
            item.parentElement.style.position = 'fixed';
            item.parentElement.style.top = '0px';
            item.parentElement.style.right = '0px';
            item.parentElement.style.zIndex = '1000';
            //reduce it's size
            item.parentElement.style.transform = 'scale(0.6)';

        }
        
    });
}, 200);
