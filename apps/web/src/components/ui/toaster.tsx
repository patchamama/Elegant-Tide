import * as Toast from '@radix-ui/react-toast'

export function Toaster() {
  return (
    <Toast.Provider swipeDirection="right">
      <Toast.Viewport className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 max-w-sm" />
    </Toast.Provider>
  )
}
