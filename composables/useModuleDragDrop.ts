import { ref, type Ref } from 'vue';
import { useLayoutStore, type ModuleId } from '~/stores/layout';

export interface DragDropState {
  isDragging: boolean;
  draggedModule: ModuleId | null;
  draggedFromDock: 'leftDock' | 'rightDock' | 'bottomDock' | 'activityBar' | null;
  dropTarget: 'leftDock' | 'rightDock' | 'bottomDock' | null;
}

const dragDropState = ref<DragDropState>({
  isDragging: false,
  draggedModule: null,
  draggedFromDock: null,
  dropTarget: null
});

export function useModuleDragDrop() {
  const layoutStore = useLayoutStore();

  const startDrag = (moduleId: ModuleId, fromDock: DragDropState['draggedFromDock']) => {
    dragDropState.value = {
      isDragging: true,
      draggedModule: moduleId,
      draggedFromDock: fromDock,
      dropTarget: null
    };
    
    // Add global class for styling
    document.body.classList.add('module-dragging');
  };

  const endDrag = () => {
    // Remove global class
    document.body.classList.remove('module-dragging');
    
    // Reset state
    dragDropState.value = {
      isDragging: false,
      draggedModule: null,
      draggedFromDock: null,
      dropTarget: null
    };
  };

  const handleDrop = (targetDock: 'leftDock' | 'rightDock' | 'bottomDock') => {
    const { draggedModule, draggedFromDock } = dragDropState.value;
    
    if (!draggedModule || !draggedFromDock) {
      endDrag();
      return;
    }

    // Don't allow dropping on the same dock (unless from activity bar)
    if (draggedFromDock === targetDock) {
      endDrag();
      return;
    }

    // Move the module to the target dock
    layoutStore.moveModuleToDock(draggedModule, targetDock);
    
    // Set it as active in the new dock
    switch (targetDock) {
      case 'leftDock':
        layoutStore.setActiveLeftModule(draggedModule);
        break;
      case 'rightDock':
        layoutStore.setActiveRightModule(draggedModule);
        layoutStore.rightSidebarVisible = true;
        break;
      case 'bottomDock':
        layoutStore.setActiveBottomModule(draggedModule);
        layoutStore.bottomPanelMinimized = false;
        break;
    }

    endDrag();
  };

  const setDropTarget = (target: DragDropState['dropTarget']) => {
    dragDropState.value.dropTarget = target;
  };

  const canDropInDock = (dockType: 'leftDock' | 'rightDock' | 'bottomDock'): boolean => {
    const { draggedModule, draggedFromDock } = dragDropState.value;
    
    if (!draggedModule || !draggedFromDock) return false;
    
    // Can't drag explorer-editor
    if (draggedModule === 'explorer-editor') return false;
    
    // Can't drag claude from right dock
    if (draggedModule === 'claude' && draggedFromDock === 'rightDock' && dockType !== 'rightDock') return false;
    
    // Can't drag terminal from bottom dock
    if (draggedModule === 'terminal' && draggedFromDock === 'bottomDock' && dockType !== 'bottomDock') return false;
    
    // Can't drop in the same dock
    if (draggedFromDock === dockType) return false;
    
    // Activity bar modules can be dropped anywhere
    if (draggedFromDock === 'activityBar') return true;
    
    // All modules can be moved between docks
    return true;
  };

  return {
    dragDropState: dragDropState as Readonly<Ref<DragDropState>>,
    startDrag,
    endDrag,
    handleDrop,
    setDropTarget,
    canDropInDock
  };
}